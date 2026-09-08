"""One explicitly metered cloud-model readiness call, persisted before dispatch; no retry."""
import json
import os
from pathlib import Path

from google import genai
from google.genai import types

from vox_crew.hosted import write_json

path = Path("/var/lib/vox-crew/inference-readiness.json")
if path.exists():
    raise SystemExit("Readiness evidence already exists; inspect it instead of repeating a model call.")
model = os.environ.get("VOX_CREW_MODEL", "gemini-3.5-flash")
write_json(path, {"status": "dispatched", "model": model, "provider": "google-cloud"})
try:
    with genai.Client(enterprise=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location="global",
        http_options=types.HttpOptions(timeout=120_000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
        response = client.models.generate_content(model=model, contents="Reply with the single word READY.",
            config=types.GenerateContentConfig(max_output_tokens=256))
    result = {"status": "responded", "model": model, "modelVersion": response.model_version,
              "provider": "google-cloud", "text": response.text,
              "usage": response.usage_metadata.model_dump(exclude_none=True) if response.usage_metadata else {}}
except Exception as error:
    result = {"status": "failed", "model": model, "errorType": type(error).__name__,
              "code": getattr(error, "code", None)}
write_json(path, result)
print(json.dumps(result))
if result["status"] != "responded" or not result["text"]:
    raise SystemExit(1)
