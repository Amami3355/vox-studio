"""Append digest-pinned Studio services to an archived crew boot config, without provider execution."""
import argparse
import base64
import json
from pathlib import Path
import re


def file(path, content, mode="0644"):
    return {"path": path, "owner": "root:root", "permissions": mode, "encoding": "b64",
            "content": base64.b64encode(content.encode()).decode()}


def render(previous, api, worker):
    for image, name in ((api, "studio-api"), (worker, "studio-worker")):
        if not re.fullmatch(r"europe-west1-docker\.pkg\.dev/studio-prod-7f3a/vox-crew/" + name + r"@sha256:[a-f0-9]{64}", image):
            raise ValueError("Studio deployment requires a verified immutable image reference.")
    disk = "/mnt/disks/vox-crew"
    options = "--rm --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=128m"
    studio_mount = f"--mount type=bind,src={disk}/studio,dst=/var/lib/vox-studio"
    setup = f"""#!/bin/bash
set -euo pipefail
findmnt -rn -S /dev/disk/by-id/google-vox-crew-state -T {disk} >/dev/null
install -d -m 0700 -o 10001 -g 10001 {disk}/studio
test -s {disk}/studio-operator/studio.env
HOME=/home/vox docker pull {api}
HOME=/home/vox docker pull {worker}
"""
    setup_unit = """[Unit]
Description=Prepare private Studio on the existing persistent disk
Requires=vox-crew-setup.service
After=vox-crew-setup.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash /etc/vox-studio/setup.sh
"""
    api_unit = f"""[Unit]
Description=Private Vox Studio API and frontend
Requires=vox-studio-setup.service
After=vox-studio-setup.service
[Service]
Environment=HOME=/home/vox
ExecStart=/usr/bin/docker run {options} --name vox-studio-api --publish 10.132.0.3:8780:8780 --env-file {disk}/studio-operator/studio.env {studio_mount} {api}
ExecStop=/usr/bin/docker stop -t 20 vox-studio-api
Restart=on-failure
RestartSec=5
TimeoutStopSec=35
[Install]
WantedBy=multi-user.target
"""
    worker_unit = f"""[Unit]
Description=Durable Studio production executor with bounded admission
Requires=vox-studio-setup.service vox-crew-bridge.service
After=vox-studio-setup.service vox-crew-bridge.service
[Service]
Environment=HOME=/home/vox
ExecStartPre=/usr/bin/docker run --rm --user 0 --network host --entrypoint python --mount type=bind,src=/etc/vox-crew,dst=/runtime {worker} /runtime/fetch-env.py --parallel
ExecStart=/usr/bin/docker run {options} --name vox-studio-worker --network host --env-file /etc/vox-crew/network.env --env-file /etc/vox-crew/parallel.env --env GOOGLE_GENAI_USE_VERTEXAI=true --env GOOGLE_CLOUD_PROJECT=studio-prod-7f3a --env GOOGLE_CLOUD_LOCATION=global --env VOX_CREW_MODEL=gemini-3.5-flash --env VOX_RESEARCH_MODEL=gemini-3.5-flash {studio_mount} --mount type=bind,src={disk}/state,dst=/var/lib/vox-crew --mount type=bind,src=/etc/vox-crew,dst=/etc/vox-crew,readonly {worker} work --state /var/lib/vox-studio --crew-state /var/lib/vox-crew --config /etc/vox-crew/autonomous
ExecStop=/usr/bin/docker stop -t 20 vox-studio-worker
Restart=no
TimeoutStopSec=35
"""
    files = [file("/etc/vox-studio/setup.sh", setup, "0755"),
             file("/etc/systemd/system/vox-studio-setup.service", setup_unit),
             file("/etc/systemd/system/vox-studio-api.service", api_unit),
             file("/etc/systemd/system/vox-studio-worker.service", worker_unit)]
    replaced = {item["path"] for item in files}
    output = json.loads(previous.removeprefix("#cloud-config").strip())
    output["write_files"] = [item for item in output["write_files"] if item["path"] not in replaced] + files
    # Boot enables the API only. Provider workers need their explicit start and existing queue authorization.
    activation = "systemctl daemon-reload && systemctl enable --now vox-studio-api.service"
    if activation not in output["runcmd"]:
        output["runcmd"].append(activation)
    install = ["#!/bin/bash", "set -euo pipefail", "test ! -e /etc/systemd/system/vox-studio-api.service"]
    for item in files:
        install.extend([f"install -d {Path(item['path']).parent.as_posix()}",
                        f"printf '%s' '{item['content']}' | base64 -d > {item['path']}",
                        f"chmod {item['permissions']} {item['path']}"])
    install.extend(["systemctl daemon-reload", "systemctl enable --now vox-studio-api.service",
                    "systemctl is-active vox-studio-api.service"])
    return "#cloud-config\n" + json.dumps(output, indent=2) + "\n", "\n".join(install) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--worker-image", required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    config, install = render(args.previous.read_text(encoding="utf-8"), args.api_image, args.worker_image)
    (args.output / "crew.yaml").write_text(config, encoding="utf-8", newline="\n")
    (args.output / "install.sh").write_text(install, encoding="utf-8", newline="\n")
    (args.output / "images.json").write_text(json.dumps({"api": args.api_image, "worker": args.worker_image}, indent=2))


if __name__ == "__main__":
    main()
