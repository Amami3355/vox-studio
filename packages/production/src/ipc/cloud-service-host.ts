import { startProductionCloudHost } from './cloud-host';

/**
 * The container's entry point. It reads the environment, starts the assembly in `cloud-host.ts`
 * and wires shutdown — and holds no logic of its own, so that everything worth asserting about
 * the cloud topology is asserted against a module a test can import.
 *
 * The local sibling is `service-host.ts`, which is unchanged and still starts the Windows service
 * over its named pipe. Neither file branches on the other's topology.
 */
const host = await startProductionCloudHost();

process.stderr.write(`Vox Production service ready on ${host.address}:${host.port}.\n`);

const stop = async () => {
  await host.close();
  process.exitCode = 0;
};

// Container-Optimized OS stops a container with SIGTERM and waits before SIGKILL, so a render in
// flight finishes its write rather than being cut off mid-file.
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
