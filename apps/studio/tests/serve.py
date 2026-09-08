"""Disposable HTTP test workspace. No crew, provider keys or worker is started."""
from pathlib import Path
import tempfile
import uvicorn
from vox_crew.studio_api import create_app

with tempfile.TemporaryDirectory(prefix="vox-studio-browser-") as directory:
    app = create_app(Path(directory), Path(__file__).resolve().parents[1] / "dist",
                     access_code="browser-test-workspace-only", origin="http://127.0.0.1:8781")
    uvicorn.run(app, host="127.0.0.1", port=8781, access_log=False)
