/**
 * How long an authenticated IPC request may stay open before the transport closes it.
 *
 * A command is allowed to take as long as the work takes: an eight-scene Remotion render is
 * minutes, not seconds. A socket closed mid-render surfaces at the launcher as
 * `vox: Production service is unavailable.` against a service that is healthy and still
 * rendering, which is the same message a real outage produces — so a timeout shorter than the
 * slowest command turns working software into an indistinguishable outage report.
 */
export const DEFAULT_IPC_SOCKET_TIMEOUT_MS = 15 * 60_000;

/**
 * Reads the operator override for {@link DEFAULT_IPC_SOCKET_TIMEOUT_MS}. Unset and empty both
 * mean "unspecified" — an exported-but-blank variable is the shape a half-written environment
 * file produces, and `Number('')` is `0`, which would otherwise close every socket immediately.
 */
export const resolveSocketTimeoutMs = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_IPC_SOCKET_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError('VOX_IPC_SOCKET_TIMEOUT_MS must be a positive number of milliseconds.');
  }
  return parsed;
};
