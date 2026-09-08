import json
from hashlib import sha256
from types import SimpleNamespace

from vox_crew.envelopes import parse_envelope
from vox_crew.operator import export_artifacts


def test_export_uses_verified_descriptors_and_never_remote_paths(tmp_path):
    data = b"actual preview bytes"
    digest = sha256(data).hexdigest()
    descriptor = {"kind": "preview", "path": "artifacts/renders/preview.mp4", "sha256": digest}
    calls = []
    class Client:
        def status(self, run_id):
            return parse_envelope(json.dumps({"protocolVersion": 1, "command": "run.status",
                "outcome": "succeeded", "run": {"id": run_id, "stage": "rendered"},
                "data": {"artifacts": [descriptor]}, "artifacts": [], "error": None, "next": []}))
        def fetch_artifact(self, run_id, artifact):
            calls.append((run_id, artifact.as_wire()))
            return SimpleNamespace(data=data)
    result = export_artifacts(Client(), "test-run", tmp_path)
    assert calls == [("test-run", descriptor)]
    assert (tmp_path / (digest + ".mp4")).read_bytes() == data
    assert not (tmp_path / "artifacts").exists()
    assert result["files"][0]["exportedAs"] == digest + ".mp4"
