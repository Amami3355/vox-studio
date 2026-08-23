"""Replays recorded vox.exe envelopes for tests. Not part of the crew.

Reads a response table, writes down the argv and working directory it was invoked with, and
prints the recorded stdout byte for byte so verbatim pass-through is actually under test.
"""

from __future__ import annotations

import json
import os
import sys


def main() -> int:
    table = json.loads(open(sys.argv[1], encoding="utf-8").read())
    argv = sys.argv[2:]
    with open(table["log"], "a", encoding="utf-8", newline="") as log:
        log.write(json.dumps({"argv": argv, "cwd": os.getcwd()}) + "\n")
    responses = table["responses"]
    response = responses.get(" ".join(argv)) or responses.get("*")
    if response is None:
        sys.stderr.write("fake-launcher: no recorded response for that command.\n")
        return 2
    # Written as bytes, like the real launcher, which copies the service's stdout straight to
    # the standard output stream. Text mode would translate the newline on Windows and the
    # verbatim assertions would be testing Python's line-ending policy instead of the client.
    sys.stdout.buffer.write(response.get("stdout", "").encode("utf-8"))
    sys.stderr.buffer.write(response.get("stderr", "").encode("utf-8"))
    return int(response.get("exitCode", 0))


if __name__ == "__main__":
    sys.exit(main())
