"""One command, headless, against a bootstrapped work root."""

from __future__ import annotations

from pathlib import Path

from conftest import recorded
from test_teaching_surface import CATEGORIES, StubClient, projection
from vox_crew import cli

EXPECTED = recorded("contract-index.stdout") + "".join(projection(name) for name in CATEGORIES)


def test_prints_every_envelope_verbatim_and_nothing_else(work_root, capsys) -> None:
    """Stdout is the transcript: envelopes, in order, byte for byte, with nothing between.

    Keeping the commentary on stderr is what makes the run pipeable into a file that is still
    a record of what production said rather than a record of what the crew said about it.
    """
    exit_code = cli.main(["--work-root", str(work_root)], client=StubClient(recorded("contract-index.stdout")))

    assert exit_code == 0
    assert capsys.readouterr().out == EXPECTED


def test_says_on_stderr_what_it_read(work_root, capsys) -> None:
    cli.main(["--work-root", str(work_root)], client=StubClient(recorded("contract-index.stdout")))

    reported = capsys.readouterr().err
    for category in CATEGORIES:
        assert category in reported


def test_leaves_the_work_root_exactly_as_it_found_it(work_root, capsys) -> None:
    before = {entry.name: entry.stat().st_size for entry in work_root.iterdir()}

    cli.main(["--work-root", str(work_root)], client=StubClient(recorded("contract-index.stdout")))

    assert {entry.name: entry.stat().st_size for entry in work_root.iterdir()} == before


def test_reports_a_refused_discovery_without_losing_what_it_read(work_root, capsys) -> None:
    exit_code = cli.main(
        ["--work-root", str(work_root)],
        client=StubClient(recorded("run-validate-failed.stdout")),
    )

    captured = capsys.readouterr()
    assert exit_code == 1
    # The refusing envelope is still on stdout. An operator debugging a broken boundary needs
    # what production said, not the crew's exception.
    assert captured.out == recorded("run-validate-failed.stdout")
    assert "INVALID_INPUT" in captured.err


def test_refuses_a_work_root_that_was_never_bootstrapped(tmp_path, capsys) -> None:
    exit_code = cli.main(["--work-root", str(tmp_path / "nowhere")], client=None)

    assert exit_code == 2
    assert "work root" in capsys.readouterr().err.lower()


def test_defaults_the_launcher_to_the_one_in_the_work_root(work_root) -> None:
    arguments = cli.parse_arguments(["--work-root", str(work_root)])

    assert arguments.work_root == work_root
    assert arguments.launcher == [str(Path(work_root) / "vox.exe")]


def test_takes_a_launcher_command_for_development(work_root) -> None:
    arguments = cli.parse_arguments(
        ["--work-root", str(work_root), "--launcher", "python", "--launcher", "stub.py"]
    )

    assert arguments.launcher == ["python", "stub.py"]
