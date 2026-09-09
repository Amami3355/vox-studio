// Holds the deployment files to two properties the first real cloud Run proved load-bearing.
// This is a static contract test because both failures happen before application code can report
// them: systemd can call a service active before it binds, and a fresh mounted volume can exist
// without the two directories the Run store needs.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cloudInit = await readFile(resolve(here, '../cloud-init.yaml'), 'utf8');
const wizard = await readFile(resolve(here, '../../scripts/deploy-cloud-service.sh'), 'utf8');

let failures = 0;
const check = (name, condition) => {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}`);
  if (!condition) failures += 1;
};

const productionUnit = cloudInit.slice(
  cloudInit.indexOf('Description=Vox trusted Production service'),
);
const crewHttpClient = await readFile(
  resolve(here, '../../services/agents/src/vox_crew/http_client.py'),
  'utf8',
);
const clientTimeoutSeconds = Number(
  crewHttpClient.match(/^DEFAULT_TIMEOUT_SECONDS = ([\d.]+)/m)?.[1],
);
const deployedTimeoutMs = Number(
  productionUnit.match(/--env VOX_IPC_SOCKET_TIMEOUT_MS=(\d+)/)?.[1],
);
check(
  'the production socket admits the entire crew request window',
  clientTimeoutSeconds > 0 && deployedTimeoutMs >= clientTimeoutSeconds * 1000,
);
check(
  'the production unit creates the fresh-volume Run directories before Docker starts',
  productionUnit.includes(
    'ExecStartPre=/bin/mkdir -p /mnt/disks/vox-runs/runs /mnt/disks/vox-runs/ledger',
  ) &&
    productionUnit.includes(
      'ExecStartPre=/bin/chmod 0700 /mnt/disks/vox-runs/runs /mnt/disks/vox-runs/ledger',
    ) &&
    productionUnit.indexOf('ExecStartPre=/bin/mkdir') <
      productionUnit.indexOf('ExecStart=/usr/bin/docker run'),
);

const readiness = wizard.slice(wizard.indexOf('stage "The service socket came up'));
check(
  'the deploy wizard waits for the loopback service socket',
  readiness.includes('ss -H -ltn') && readiness.includes('127\\.0\\.0\\.1:8080'),
);
check(
  'systemd active is not used as the readiness signal',
  !readiness.includes('systemctl is-active vox-production.service'),
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
