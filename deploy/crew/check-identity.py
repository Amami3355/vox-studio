"""Run in the crew container; print only HTTP status codes, never credential payloads."""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    metadata = "http://metadata.google.internal/computeMetadata/v1/"
    headers = {"Metadata-Flavor": "Google"}
    with urlopen(Request(metadata + "instance/service-accounts/default/token", headers=headers), timeout=20) as response:
        token = json.load(response)["access_token"]
    with urlopen(Request(metadata + "project/project-id", headers=headers), timeout=20) as response:
        project = response.read().decode()
    checks = []
    for name in ("VOX_NETWORK_TOKEN", "VOX_RUN_HMAC_KEY", "VOX_GRANT_KEY", "ELEVENLABS_API_KEY"):
        checks.append((name, f"https://secretmanager.googleapis.com/v1/projects/{project}/secrets/{name}/versions/latest:access",
                       200 if name == "VOX_NETWORK_TOKEN" else 403))
    for repository in ("vox-crew", "vox"):
        checks.append((repository, f"https://artifactregistry.googleapis.com/v1/projects/{project}/locations/europe-west1/repositories/{repository}/dockerImages",
                       200 if repository == "vox-crew" else 403))
    failed = False
    for name, url, expected in checks:
        try:
            with urlopen(Request(url, headers={"Authorization": "Bearer " + token}), timeout=20) as response:
                status = response.status
        except HTTPError as error:
            status = error.code
            error.close()
        print(json.dumps({"resource": name, "status": status, "expected": expected}), flush=True)
        failed |= status != expected
    if failed:
        raise SystemExit("Crew identity boundary check failed.")


if __name__ == "__main__":
    main()
