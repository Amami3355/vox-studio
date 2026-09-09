// Read-only voice access check, executed only inside Production. Never prints credentials.
const voiceId = 'JBFqnCBsd6RMkjVDRZzb';
const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
  headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  signal: AbortSignal.timeout(30_000),
});
let name = null;
if (response.ok) name = (await response.json()).name;
console.info(
  JSON.stringify({
    provider: 'elevenlabs',
    voiceId,
    status: response.status,
    name,
    narrationCalls: 0,
  }),
);
if (!response.ok) process.exitCode = 1;
