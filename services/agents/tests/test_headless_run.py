"""The command as an operator runs it: a separate process, a work root, a launcher.

The other CLI tests call `main` in-process with a stub client, which leaves two things
untested — that the module is runnable at all, and that the client it builds for itself spawns
the launcher correctly. This runs the real entry point end to end. The only thing standing in
for production is the launcher on the far side of the subprocess boundary.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from conftest import FAKE_LAUNCHER, recorded
from test_cli import discovery
from test_complete_run import PLAN, a_complete_run
from test_teaching_surface import CATEGORIES, projection
from vox_crew.evidence import COMMANDS, PASS, read_bundle, verify

SOURCE = Path(__file__).resolve().parents[1] / "src"


def test_one_command_reads_the_teaching_surface_and_leaves_the_work_root_alone(
    work_root, tmp_path
) -> None:
    responses = {"production contract index": {"stdout": recorded("contract-index.stdout")}}
    for category in CATEGORIES:
        responses[f"production contract show {category}"] = {"stdout": projection(category)}
    table = tmp_path / "responses.json"
    table.write_text(
        json.dumps({"log": str(tmp_path / "invocations.jsonl"), "responses": responses}),
        encoding="utf-8",
        newline="",
    )

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "vox_crew",
            "--work-root",
            str(work_root),
            "--discovery-only",
            "--launcher",
            sys.executable,
            "--launcher",
            str(FAKE_LAUNCHER),
            "--launcher",
            str(table),
        ],
        capture_output=True,
        env={**os.environ, "PYTHONPATH": str(SOURCE), "PYTHONIOENCODING": "utf-8"},
        timeout=120,
    )

    assert completed.returncode == 0, completed.stderr.decode("utf-8", "replace")
    expected = recorded("contract-index.stdout") + "".join(
        projection(category) for category in CATEGORIES
    )
    assert completed.stdout.decode("utf-8") == expected
    # The work root is what `bootstrap:workroot` left, still. No projection was cached into it.
    assert sorted(entry.name for entry in work_root.iterdir()) == ["request.json", "vox.exe"]


def test_one_command_converges_on_the_brief_and_leaves_a_bundle_behind(
    work_root, launcher
) -> None:
    """The command as the proof harness's crew driver spawns it, in a separate process.

    This is the shape ticket 12 depends on and the one the in-process tests cannot prove: the
    module is runnable, it builds its own client, it spawns the launcher for every command, and
    the bundle survives the process that wrote it. Everything but the launcher is real.
    """
    stub = launcher({**discovery(), **a_complete_run()})
    (work_root / "plan.json").write_text(
        json.dumps(PLAN, indent=2) + "\n", encoding="utf-8", newline=""
    )

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "vox_crew",
            "--work-root",
            str(work_root),
            "--plan",
            "plan.json",
            *[word for part in stub.command for word in ("--launcher", part)],
        ],
        capture_output=True,
        env={**os.environ, "PYTHONPATH": str(SOURCE), "PYTHONIOENCODING": "utf-8"},
        timeout=300,
    )

    assert completed.returncode == 0, completed.stderr.decode("utf-8", "replace")
    written = read_bundle(work_root / "evidence")
    assert verify(written) == PASS
    # Thirteen commands: the seven of discovery, then the six a Run takes to a rendered
    # preview. Discovery asks for every category the index publishes, including the ones no
    # prompt carries — what the crew reads and what it teaches are different counts.
    assert len(written[COMMANDS].decode("utf-8").splitlines()) == 13


def test_says_so_when_the_work_root_is_not_there(tmp_path) -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "vox_crew", "--work-root", str(tmp_path / "absent")],
        capture_output=True,
        env={**os.environ, "PYTHONPATH": str(SOURCE)},
        timeout=120,
    )

    assert completed.returncode == 2
    assert b"no work root" in completed.stderr
