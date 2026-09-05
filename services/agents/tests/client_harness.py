"""One harness per production client, so the contract suite can drive all of them.

The interface is payload-shaped in both directions, which is exactly what makes a shared suite
possible — and exactly what makes it hard to *set up*. A contract test needs a Run that exists
and an artifact that is in it, and neither can be arranged through the interface: `init` is the
only way to open a Run and no method publishes bytes. Each implementation arranges them its own
way, and this is where that knowledge lives, so no test learns which client it holds.

`publish` is the operation with a different mechanism everywhere and the same meaning: *a
command produced these bytes in this Run.* Locally and over HTTP it writes a file into the Run
directory the store keeps; in memory it puts an entry in a dictionary.

`staged` is the read-back the other way: *what did the implementation hand production for this
payload?* It is how a contract test asserts that a plan crossed as an object rather than
asserting an argv, which is the launcher's business and stays in its own file.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from vox_crew.client import ProductionClient


@dataclass(frozen=True, slots=True)
class ClientHarness:
    """A client under test, and the two things a contract test cannot ask it for."""

    name: str
    client: ProductionClient
    open_run: Callable[[], str]
    publish: Callable[[str, str, bytes], None]
    staged: Callable[[str, str], Any]
    unknown_run_id: str = "a-run-that-was-never-initialised"
