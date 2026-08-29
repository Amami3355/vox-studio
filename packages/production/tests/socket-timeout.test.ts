import { describe, expect, it } from 'vitest';
import { DEFAULT_IPC_SOCKET_TIMEOUT_MS, resolveSocketTimeoutMs } from '../src/ipc/socket-timeout';

describe('IPC socket timeout', () => {
  it('outlasts the slowest command the service runs', () => {
    // A measured eight-scene render took 277.1 s. The default has to clear that by enough
    // margin that a slower brief is not reported as an outage.
    expect(DEFAULT_IPC_SOCKET_TIMEOUT_MS).toBeGreaterThan(277_100);
  });

  it('falls back to the default when the variable is unset', () => {
    expect(resolveSocketTimeoutMs(undefined)).toBe(DEFAULT_IPC_SOCKET_TIMEOUT_MS);
  });

  it('treats an exported-but-blank variable as unset rather than as zero', () => {
    // `Number('')` is 0, which would close every socket the instant it opened.
    expect(resolveSocketTimeoutMs('')).toBe(DEFAULT_IPC_SOCKET_TIMEOUT_MS);
    expect(resolveSocketTimeoutMs('   ')).toBe(DEFAULT_IPC_SOCKET_TIMEOUT_MS);
  });

  it('accepts a positive override', () => {
    expect(resolveSocketTimeoutMs('30000')).toBe(30_000);
    expect(resolveSocketTimeoutMs(' 45000 ')).toBe(45_000);
  });

  it('rejects a value that is not a positive number of milliseconds', () => {
    for (const raw of ['0', '-1', 'soon', '15 minutes', 'NaN', 'Infinity']) {
      expect(() => resolveSocketTimeoutMs(raw)).toThrow(/positive number of milliseconds/);
    }
  });
});
