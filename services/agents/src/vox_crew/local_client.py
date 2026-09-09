"""The local implementation of the production client: one `vox.exe` subprocess per command.

This is the only module in the crew that knows a path exists. Everything above it names a Run
by its id and passes payloads as objects; everything below it is the launcher, the named pipe
and the trusted service, none of which the crew can see. When the service moves to Cloud Run
an HTTP implementation joins this one and nothing else changes — that is the whole point of
keeping the knowledge in one file.

Three things are worth knowing about how it holds the code-blind boundary.

**The working directory is the boundary.** Commands run with the process's directory set to
the work root and every argument written relative to it, exactly as the proof drivers did. The
audit trail that results names Runs and files, never the host machine.

**Payloads are staged, not required.** The command surface takes its inputs as files, so the
objects callers pass have to land somewhere before the command can read them. Where they land
is chosen so the work root keeps its invariant of growing nothing but its Run directories: a
plan, a decline decision and a replacement authorisation are written inside the Run they
belong to, where an audit can find them afterwards, and the one payload that has nowhere to go
— the request that creates the Run, before the Run exists — is written transiently and removed
when the command returns.

**A Run id is resolvable without this object.** The directory a Run lives in is remembered
after `init`, but a Run id also resolves by reading the checkpoints already in the work root,
so a crew process that restarts can pick up a Run it did not open.
"""

from __future__ import annotations

import json
import subprocess
import uuid
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
from typing import Any

from .client import (
    Artifact,
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    ProductionUnavailable,
    UnknownRun,
)
from .envelopes import ArtifactDescriptor, MalformedEnvelope, ResultEnvelope, parse_envelope

CHECKPOINT = "run.json"
DEFAULT_LAUNCHER = "vox.exe"
# Long enough for a render, which is the only command that takes minutes.
DEFAULT_TIMEOUT_SECONDS = 1800.0


def _hashed(data: bytes) -> str:
    return sha256(data).hexdigest()


def _canonical(payload: Mapping[str, Any]) -> str:
    """Payload bytes as the crew authored them: readable, so a receipt is readable too."""
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


class LocalProductionClient(ProductionClient):
    def __init__(
        self,
        work_root: Path | str,
        *,
        launcher_command: Sequence[str] | None = None,
        env: Mapping[str, str] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._work_root = Path(work_root).resolve()
        self._launcher = list(
            launcher_command
            if launcher_command is not None
            else [str(self._work_root / DEFAULT_LAUNCHER)]
        )
        self._env = dict(env) if env is not None else None
        self._timeout_seconds = timeout_seconds
        self._directories: dict[str, str] = {}

    # -- the command surface ---------------------------------------------------------------

    def contract_index(self) -> ResultEnvelope:
        return self._invoke(["production", "contract", "index"])

    def contract_show(self, category: str) -> ResultEnvelope:
        return self._invoke(["production", "contract", "show", category])

    def init(self, request: Mapping[str, Any]) -> ResultEnvelope:
        directory = f"run-{uuid.uuid4().hex[:12]}"
        with self._transient(request) as staged:
            envelope = self._invoke(
                ["production", "run", "init", "--request", staged, "--out", directory]
            )
        if envelope.run is not None:
            self._directories[envelope.run.id] = directory
        return envelope

    def status(self, run_id: str) -> ResultEnvelope:
        return self._run_command("status", run_id)

    def progress(self, run_id: str) -> ResultEnvelope:
        from copy import copy
        observer = copy(self)
        observer._timeout_seconds = 5
        return observer._run_command("progress", run_id)

    def validate(self, run_id: str, plan: Mapping[str, Any]) -> ResultEnvelope:
        directory = self._directory(run_id)
        plan_argument = self._stage(directory, "plan.json", plan)
        return self._invoke(
            ["production", "run", "validate", "--run", directory, "--plan", plan_argument]
        )

    def preflight(self, run_id: str) -> ResultEnvelope:
        return self._run_command("preflight", run_id)

    def record(
        self, run_id: str, replacement_authorisation: Mapping[str, Any] | None = None
    ) -> ResultEnvelope:
        directory = self._directory(run_id)
        argv = ["production", "run", "record", "--run", directory]
        if replacement_authorisation is not None:
            staged = self._stage(
                directory, "replacement-authorisation.json", replacement_authorisation
            )
            argv += ["--replacement-authorisation", staged]
        return self._invoke(argv)

    def compile(self, run_id: str) -> ResultEnvelope:
        return self._run_command("compile", run_id)

    def render(self, run_id: str) -> ResultEnvelope:
        return self._run_command("render", run_id)

    def image_start(
        self,
        run_id: str,
        request: Mapping[str, Any],
        authorisation: Mapping[str, Any] | None = None,
    ) -> ResultEnvelope:
        directory = self._directory(run_id)
        staged_request = self._stage(directory, "image-request.json", request)
        argv = [
            "production",
            "run",
            "image-start",
            "--run",
            directory,
            "--request",
            staged_request,
        ]
        if authorisation is not None:
            staged_grant = self._stage(directory, "image-authorisation.json", authorisation)
            argv += ["--authorisation", staged_grant]
        return self._invoke(argv)

    def image_status(self, run_id: str, job_id: str) -> ResultEnvelope:
        return self._invoke(
            [
                "production",
                "run",
                "image-status",
                "--run",
                self._directory(run_id),
                "--job",
                job_id,
            ]
        )

    def image_accept(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        return self._image_decision("image-accept", run_id, "image-acceptance.json", decision)

    def image_reject(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        return self._image_decision("image-reject", run_id, "image-rejection.json", decision)

    def decline(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        directory = self._directory(run_id)
        staged = self._stage(directory, "decision.json", decision)
        return self._invoke(
            ["production", "run", "decline", "--run", directory, "--decision", staged]
        )

    def _image_decision(
        self, verb: str, run_id: str, name: str, decision: Mapping[str, Any]
    ) -> ResultEnvelope:
        directory = self._directory(run_id)
        staged = self._stage(directory, name, decision)
        return self._invoke(
            ["production", "run", verb, "--run", directory, "--decision", staged]
        )

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        target = self._within(self._work_root / self._directory(run_id), artifact.path)
        try:
            data = target.read_bytes()
        except FileNotFoundError as absent:
            raise ArtifactMissing(
                f"Run {run_id} published {artifact.kind!r} and it is not there."
            ) from absent
        actual = _hashed(data)
        if actual != artifact.sha256:
            raise ArtifactCorrupted(
                f"Run {run_id} published {artifact.kind!r} as {artifact.sha256} and it hashes "
                f"to {actual}."
            )
        return Artifact(kind=artifact.kind, sha256=actual, data=data)

    # -- everything below here is the part that knows about paths --------------------------

    def _run_command(self, verb: str, run_id: str) -> ResultEnvelope:
        return self._invoke(["production", "run", verb, "--run", self._directory(run_id)])

    def _invoke(self, argv: list[str]) -> ResultEnvelope:
        try:
            completed = subprocess.run(  # noqa: S603 - the launcher is the boundary
                [*self._launcher, *argv],
                cwd=self._work_root,
                env=self._env,
                capture_output=True,
                timeout=self._timeout_seconds,
            )
        except FileNotFoundError as absent:
            raise ProductionUnavailable(
                f"The launcher is not in the work root: {self._launcher[0]}"
            ) from absent
        except subprocess.TimeoutExpired as expired:
            raise ProductionUnavailable(
                f"production {' '.join(argv[1:])} did not return within "
                f"{self._timeout_seconds:.0f}s."
            ) from expired

        stdout = completed.stdout.decode("utf-8", errors="replace")
        try:
            return parse_envelope(stdout)
        except MalformedEnvelope as malformed:
            # The launcher's own diagnostics go to stderr and are the operator's only clue
            # when the pipe is down. Losing them here would turn a configuration problem into
            # an unexplained parse error.
            stderr = completed.stderr.decode("utf-8", errors="replace").strip()
            raise MalformedEnvelope(
                f"{malformed} (exit {completed.returncode}"
                f"{'; ' + stderr if stderr else ''})"
            ) from malformed

    def _stage(self, directory: str, name: str, payload: Mapping[str, Any]) -> str:
        """Writes a payload inside the Run it belongs to, and returns the argument to pass."""
        target = self._within(self._work_root / directory, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_canonical(payload), encoding="utf-8", newline="")
        return f"{directory}/{name}"

    @contextmanager
    def _transient(self, payload: Mapping[str, Any]) -> Iterator[str]:
        """Stages a payload that has no Run to live in yet, and takes it away again.

        `run init` reads the request before the Run root exists — the service refuses to
        initialise into a directory that is already there — so this one payload has nowhere
        durable to go. It is removed however the command ends, because a work root that keeps
        a stray file after a crashed init has stopped being evidence of anything.
        """
        name = f".inbox-{uuid.uuid4().hex[:12]}.json"
        target = self._work_root / name
        target.write_text(_canonical(payload), encoding="utf-8", newline="")
        try:
            yield name
        finally:
            target.unlink(missing_ok=True)

    def _directory(self, run_id: str) -> str:
        remembered = self._directories.get(run_id)
        if remembered is not None:
            return remembered
        for candidate in sorted(self._work_root.iterdir()):
            if not candidate.is_dir():
                continue
            checkpoint = candidate / CHECKPOINT
            if not checkpoint.is_file():
                continue
            try:
                identifier = json.loads(checkpoint.read_text(encoding="utf-8")).get("runId")
            except (OSError, json.JSONDecodeError, AttributeError):
                continue
            if identifier == run_id:
                self._directories[run_id] = candidate.name
                return candidate.name
        raise UnknownRun(f"No Run named {run_id!r} in this work root.")

    def _within(self, root: Path, relative: str) -> Path:
        """Resolves a Run-relative locator, refusing anything that leaves the Run.

        Descriptors come from envelopes the service wrote, so this should never fire. It is
        here because the alternative to checking is trusting a string to stay inside a
        boundary, and the boundary is the product.
        """
        target = (root / relative).resolve()
        if root.resolve() not in target.parents:
            raise ArtifactOutsideRun(
                f"{relative!r} is not inside the Run that published it."
            )
        return target
