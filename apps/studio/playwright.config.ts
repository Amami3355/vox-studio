import path from 'node:path';
import { defineConfig } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const python = path.join(
  root,
  'services/agents/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  outputDir: '../../.scratch/hackathon-launch/runtime/studio-browser-tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8781',
    channel: process.env.VOX_TEST_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `"${python}" tests/serve.py`,
    url: 'http://127.0.0.1:8781/',
    reuseExistingServer: false,
    env: { PYTHONPATH: path.join(root, 'services/agents/src') },
  },
});
