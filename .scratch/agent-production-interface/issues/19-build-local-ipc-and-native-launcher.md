# Build local IPC and the native agent distribution

Type: task
Status: resolved
Blocked by: 17, 18

## Objective

Expose the complete service through authenticated Windows named-pipe IPC and a native thin
`vox` launcher whose agent-readable distribution passes ADR-0007's permanent leak gate.

## Scope

- Add the trusted service host, authenticated named-pipe endpoint and request framing; prohibit
  TCP/HTTP, including loopback.
- Build a native Windows launcher that forwards argv and exact stdio/exit semantics without
  shipping Node, JavaScript, TypeScript, source maps or production logic.
- Stage the agent distribution from an empty allowlist and keep the IPC capability, service
  source/dependencies, credentials and private ledger outside it.
- Add recursive filename, content, binary and embedded-archive scanning for every forbidden
  marker from ticket 04, plus sanitized service errors and stderr.
- Exercise every public command as a restricted OS principal, prove repository/service paths
  unreadable, and enforce outbound denial for every command other than service-side `record`.

## Acceptance

The agent receives one native launcher and public outputs only; the isolated command suite is
green and any leak, internal path, stack trace or unauthorized network attempt fails the build.

## Verification

```text
pnpm --filter @vox/production typecheck
pnpm test -- packages/production/tests/ipc.test.ts packages/production/tests/stdio-contract.test.ts packages/production/tests/network-policy.test.ts
pnpm --filter @vox/production build:agent-distribution
pnpm --filter @vox/production verify:agent-distribution
```

## Answer

Implemented 2026-08-13.

- The trusted Production host exposes only a normalized Windows named pipe. Requests and
  responses use one bounded length-prefixed JSON frame, protocol/version and request-id
  binding, a 30-second clock window, replay rejection and HMAC-SHA-256 authentication. TCP,
  HTTP and loopback address shapes are rejected before listening.
- The public response transports stdout and stderr as authenticated Base64 UTF-8 bytes. The
  launcher decodes them directly to the process standard streams, preserving the one-line JSON
  envelope, empty-stderr and `0`/`1`/`2` exit semantics even for nested contract JSON.
- `vox.exe` is a compiled x64 Windows PE launcher backed by the installed .NET Framework. It
  contains only cwd/argv forwarding, named-pipe framing/authentication and stdio handling; it
  ships no Node runtime, JavaScript, TypeScript, source maps, production implementation or
  credential names.
- The build starts from empty agent and service staging directories. The agent allowlist is
  exactly `dist/agent/vox.exe`. A separate `vox-pipe-acl.exe` remains under trusted
  `dist/service/`; it grants pipe read/write to Windows `Restricted Code` and `Users`, while
  the HMAC capability remains mandatory for every request. It is never copied into the agent
  distribution.
- The recursive leak gate rejects links, archives, source/runtime extensions, embedded ZIPs,
  repository paths, implementation/JSDoc/source-map markers, credential configuration names
  and common outbound-network API markers. IPC errors expose only sanitized public envelopes;
  paths, stack lines, dependency directories and implementation directories are redacted.
- The launcher suite loads the exact compiled `vox.exe`, then invokes it under a Windows SAFER
  `CONSTRAINED` token. That same effective token proves read/write access to the isolated work
  root and denied reads for both a repository source file and a separately rooted private
  ledger/authority tree. It exercises contract index/show, init, status, validate, Preflight,
  record, compile, render, decline and malformed invocation through the authenticated pipe.
- The service injects the only provider-capable adapter into `record`; all other public
  commands are tested without synthesis or generic network calls. The agent launcher contains
  no TCP/HTTP client path. No real provider or credential was used.

Verification actually run:

```text
pnpm --filter @vox/production typecheck
  PASS
pnpm test -- packages/production/tests/ipc.test.ts packages/production/tests/stdio-contract.test.ts packages/production/tests/network-policy.test.ts
  PASS - 3 files, 7 tests
pnpm --filter @vox/production build:agent-distribution
  PASS - agent launcher and trusted pipe ACL helper compiled
pnpm --filter @vox/production verify:agent-distribution
  PASS - exactly dist/agent/vox.exe is agent-readable
git diff --check
  PASS
```

This resolves the IPC/distribution implementation ticket only. It is not the fresh-agent
Northbridge evidence run and makes no code-blind end-to-end claim; tickets 20 and 21 own that
harness and actual proof respectively.
