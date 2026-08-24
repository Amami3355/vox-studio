"""Replays recorded vox.exe envelopes for tests. Not part of the crew.

Reads a response table, writes down the argv and working directory it was invoked with, and
prints the recorded stdout byte for byte so verbatim pass-through is actually under test.

A response is found by the longest argv prefix a test wrote down, falling back to `"*"`. The
prefix is what makes a whole Run scriptable: a Run's directory is chosen by the client and is
not known when the table is written, so `production run validate` has to be sayable without
the `--run run-3a91c0e4bb17` that follows it.

A response may also publish artifacts, which are written inside the Run the command names, at
the paths the envelope's descriptors give. A stub that returned a descriptor and left nothing
behind would make the read-back direction of the client untestable, and the read-back is the
direction the cloud phase turns on.
"""

from __future__ import annotations

import base64
import json
import os
import sys


def response_for(responses: dict, argv: list) -> dict | None:
    for length in range(len(argv), 0, -1):
        found = responses.get(" ".join(argv[:length]))
        if found is not None:
            return found
    return responses.get("*")


def run_directory(argv: list) -> str | None:
    """The Run a command names, the way the real launcher's cwd-relative arguments name it."""
    for flag in ("--run", "--out"):
        if flag in argv:
            return argv[argv.index(flag) + 1]
    return None


def publish(argv: list, artifacts: dict) -> None:
    if not artifacts:
        return
    root = run_directory(argv)
    if root is None:
        raise SystemExit("fake-launcher: a response published artifacts for no Run.")
    for relative, encoded in artifacts.items():
        target = os.path.join(root, *relative.split("/"))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as artifact:
            artifact.write(base64.b64decode(encoded))


def main() -> int:
    table = json.loads(open(sys.argv[1], encoding="utf-8").read())
    argv = sys.argv[2:]
    with open(table["log"], "a", encoding="utf-8", newline="") as log:
        log.write(json.dumps({"argv": argv, "cwd": os.getcwd()}) + "\n")
    response = response_for(table["responses"], argv)
    if response is None:
        sys.stderr.write("fake-launcher: no recorded response for that command.\n")
        return 2
    publish(argv, response.get("artifacts") or {})
    # Written as bytes, like the real launcher, which copies the service's stdout straight to
    # the standard output stream. Text mode would translate the newline on Windows and the
    # verbatim assertions would be testing Python's line-ending policy instead of the client.
    sys.stdout.buffer.write(response.get("stdout", "").encode("utf-8"))
    sys.stderr.buffer.write(response.get("stderr", "").encode("utf-8"))
    return int(response.get("exitCode", 0))


if __name__ == "__main__":
    sys.exit(main())
