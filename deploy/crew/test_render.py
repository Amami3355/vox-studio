"""Check rendered boot dependencies and the persistent/credential boundaries."""
import base64
import importlib.util
import json
from pathlib import Path

import pytest
import yaml

spec = importlib.util.spec_from_file_location("crew_render", Path(__file__).with_name("render.py"))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)
IMAGE = "europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:" + "a" * 64
KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestOnly root@test"


def files(config):
    return {entry["path"]: base64.b64decode(entry["content"]).decode()
            for entry in config["write_files"] if entry.get("encoding") == "b64"}


def test_crew_boot_requires_disk_and_keeps_ssh_key_out_of_container():
    config = json.loads(render.crew(IMAGE, "10.132.0.2", KEY, "run-test").split("\n", 1)[1])
    content = files(config)
    attempt = content["/etc/systemd/system/vox-crew-attempt.service"]
    assert "Restart=no" in attempt
    assert "src=/mnt/disks/vox-crew/state,dst=/var/lib/vox-crew" in attempt
    assert "src=/mnt/disks/vox-crew/bridge" not in attempt
    assert "dst=/etc/vox-crew,readonly" in attempt
    assert "Requires=vox-crew-setup.service" in attempt
    setup = content["/etc/systemd/system/vox-crew-setup.service"]
    assert r"Requires=mnt-disks-vox\x2dcrew.mount" in setup
    assert "StrictHostKeyChecking=yes" in content["/etc/systemd/system/vox-crew-bridge.service"]
    assert "VOX_RUN_HMAC_KEY" not in "\n".join(content.values())


def test_production_extension_preserves_boot_and_limits_ssh_to_one_port():
    config = yaml.safe_load(render.production(IMAGE.replace("/crew@", "/production@"), KEY))
    content = files(config)
    bridge = content["/etc/ssh/sshd_config.d/00-vox-bridge.conf"]
    assert "MaxSessions 0" in bridge
    assert "PermitOpen 127.0.0.1:8080" in bridge
    assert "AuthorizedKeysCommand none" in bridge
    assert "AllowStreamLocalForwarding no" in bridge
    assert "systemctl enable --now vox-production.service" in config["runcmd"]
    assert config["runcmd"][-1] == "bash /etc/vox/install-production-bridge.sh"
    assert "${" not in render.production(IMAGE.replace("/crew@", "/production@"), KEY)


def test_moving_image_tags_are_refused():
    with pytest.raises(ValueError, match="immutable"):
        render.crew("vox-crew:latest", "10.132.0.2", KEY, "run-test")


def test_crew_image_cannot_share_production_registry_permissions():
    with pytest.raises(ValueError, match="separate registry"):
        render.crew(IMAGE.replace("/vox-crew/", "/vox/"), "10.132.0.2", KEY, "run-test")


def test_probe_uses_the_public_run_identifier_not_its_storage_directory():
    run_id = "23aace30-7d2c-4715-b5f8-77003fcd57e1"
    config = json.loads(render.crew(IMAGE, "10.132.0.2", KEY, run_id).split("\n", 1)[1])
    probe = files(config)["/etc/systemd/system/vox-crew-probe.service"]
    assert "--run-id " + run_id in probe


@pytest.mark.parametrize("run_id", ["", "run-id --other-option", "run-id;true", "../run-id"])
def test_run_identifier_cannot_inject_unit_arguments(run_id):
    with pytest.raises(ValueError, match="Run identifier"):
        render.crew(IMAGE, "10.132.0.2", KEY, run_id)
