"""Exercise the real wizard with a fake gcloud and browser; no cloud calls or real keys."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BASH = (
    "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash")
)
DRIVER = r'''
gcloud() {
  printf '%s\n' "$*" >> "$MOCK_DIR/calls"
  case "$*" in
    "secrets describe PARALLEL_API_KEY "*) return "${MOCK_DESCRIBE_EXIT:-0}" ;;
    "secrets get-iam-policy PARALLEL_API_KEY "*)
      printf '%s\n' "${MOCK_READER:-serviceAccount:vox-crew@test-project.iam.gserviceaccount.com}" ;;
    "secrets versions list PARALLEL_API_KEY "*)
      [[ "${MOCK_LIST_EXIT:-0}" == 0 ]] || return "$MOCK_LIST_EXIT"
      # gcloud's list formatter transforms ENABLED to lowercase (unlike describe).
      if [[ -f "$MOCK_DIR/payload" ]]; then printf 'enabled\r\n'
      else printf '%s\r\n' "${MOCK_STATE:-}"; fi ;;
    "secrets versions add PARALLEL_API_KEY --data-file=- "*)
      cat > "$MOCK_DIR/payload"
      if [[ "${MOCK_ADD_EXIT:-0}" != 0 ]]; then
        cat "$MOCK_DIR/payload" >&2
        return "$MOCK_ADD_EXIT"
      fi ;;
    *) printf 'Unexpected cloud command\n' >&2; return 99 ;;
  esac
}
wslview() { :; }
export -f gcloud wslview
bash "$MOCK_WIZARD" "$@"
'''


class ParallelWizardTest(unittest.TestCase):
    def run_wizard(self, value="", args=None, **settings):
        with tempfile.TemporaryDirectory(prefix="vox-parallel-test-") as directory:
            scratch = Path(directory)
            env_path = scratch / "config.env"
            env_path.write_text("UNCHANGED=yes\n_PARALLEL_INPUT=stale-value\n")
            env = dict(os.environ)
            env.update(
                MOCK_DIR=scratch.as_posix(),
                MOCK_WIZARD=(ROOT / "scripts/provision-cloud-project.sh").as_posix(),
                VOX_CLOUD_ENV_FILE=env_path.as_posix(),
                **settings,
            )
            result = subprocess.run(
                [BASH, "-c", DRIVER, "test-wizard", *(
                    args if args is not None
                    else ["--parallel-only", "--project", "test-project"]
                )],
                input=value.encode(), capture_output=True, cwd=ROOT, env=env, timeout=20,
            )
            result.stdout = result.stdout.decode("utf-8")
            result.stderr = result.stderr.decode("utf-8")
            calls = (scratch / "calls").read_text() if (scratch / "calls").exists() else ""
            payload = (scratch / "payload").read_bytes() if (scratch / "payload").exists() else None
            self.assertEqual(env_path.read_text(), "UNCHANGED=yes\n_PARALLEL_INPUT=stale-value\n")
            for call in calls.splitlines():
                self.assertIn("PARALLEL_API_KEY", call)
                self.assertIn("--project=test-project", call)
                self.assertNotIn("versions access", call)
            return result, calls, payload

    def test_missing_key_is_written_once_through_stdin(self):
        key = "synthetic-only-$literal`characters"
        result, calls, payload = self.run_wizard(key + "\n")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(payload, key.encode())
        self.assertEqual(calls.count("versions add"), 1)
        self.assertNotIn(key, calls + result.stdout + result.stderr)
        self.assertIn("ENABLED", result.stdout)

    def test_empty_resource_cannot_be_kept_with_enter(self):
        result, calls, payload = self.run_wizard("\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("versions add", calls)
        self.assertIsNone(payload)

    def test_enabled_latest_is_kept_without_rotation(self):
        for state in ("enabled", "ENABLED"):
            with self.subTest(state=state):
                result, calls, payload = self.run_wizard(MOCK_STATE=state)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("versions add", calls)
                self.assertIsNone(payload)

    def test_disabled_latest_requires_a_key(self):
        result, calls, _ = self.run_wizard("\n", MOCK_STATE="DISABLED")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("versions add", calls)

    def test_metadata_or_iam_failure_prevents_writes(self):
        for settings in (
            {"MOCK_DESCRIBE_EXIT": "1"}, {"MOCK_LIST_EXIT": "1"},
            {"MOCK_READER": "serviceAccount:unexpected@test-project.iam.gserviceaccount.com"},
        ):
            with self.subTest(settings=settings):
                result, calls, _ = self.run_wizard("synthetic-only\n", **settings)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("versions add", calls)

    def test_failed_upload_is_not_retried_or_leaked(self):
        key = "synthetic-error-payload"
        result, calls, _ = self.run_wizard(key + "\n", MOCK_ADD_EXIT="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls.count("versions add"), 1)
        self.assertNotIn(key, calls + result.stdout + result.stderr)

    def test_invalid_key_does_not_write(self):
        result, calls, _ = self.run_wizard("synthetic key\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("versions add", calls)

    def test_default_and_invalid_arguments_never_call_cloud(self):
        for args, status in (([], 0), (["--help"], 0), (["--parallel-only"], 2), (["--typo"], 2)):
            with self.subTest(args=args):
                result, calls, _ = self.run_wizard(args=args)
                self.assertEqual(result.returncode, status)
                self.assertEqual(calls, "")


if __name__ == "__main__":
    unittest.main()
