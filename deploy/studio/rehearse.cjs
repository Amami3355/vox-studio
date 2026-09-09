/* Hosted browser rehearsal. Reads credentials only from a local file; never authorizes work. */
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const req = createRequire(path.resolve('apps/studio/package.json'));
const { chromium, expect } = req('@playwright/test');

async function main() {
  const [origin, jobId, output] = process.argv.slice(2);
  if (!origin || !jobId || !output) throw new Error('Usage: node deploy/studio/rehearse.cjs <origin> <job> <output-directory>');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.VOX_TEST_BROWSER || 'msedge' });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const login = await context.newPage();
    await login.goto(`${origin}/?film=${jobId}`);
    await login.getByLabel('Access code').fill(fs.readFileSync('.scratch/hackathon-launch/runtime/studio/access-code.txt', 'utf8').trim());
    await login.getByRole('button', { name: 'Enter studio' }).click();
    await expect(login.getByRole('button', { name: /New film/ })).toBeVisible({ timeout: 30000 });
    const job = await (await context.request.get(`${origin}/api/jobs/${jobId}`)).json();
    if (!job.preview) throw new Error('No preview available for this rehearsal.');
    // Record only after authentication; the access code and cookie are never captured.
    const recording = await browser.newContext({ storageState: await context.storageState(),
      viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
      recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
    const page = await recording.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?film=${jobId}`);
    await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(v => v.readyState), { timeout: 60000 }).toBeGreaterThanOrEqual(1);
    const media = await video.evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
    await video.evaluate(async v => { v.muted = true; await v.play(); });
    await expect.poll(() => video.evaluate(v => v.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
    await video.evaluate(v => { v.currentTime = Math.min(23, v.duration / 2); });
    await expect.poll(() => video.evaluate(v => !v.seeking && v.currentTime >= Math.min(23, v.duration / 2)), { timeout: 30000 }).toBe(true);
    await video.evaluate(v => v.pause());
    await page.getByRole('tab', { name: /Sources/ }).click();
    await expect(page.locator('.source-row')).toHaveCount(job.sources.length);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    const downloads = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      const received = page.waitForEvent('download', { timeout: 60000 });
      await page.getByRole('link', { name: 'Download', exact: true }).click();
      const download = await received;
      const filename = path.join(output, `download-${attempt + 1}.mp4`);
      await download.saveAs(filename);
      const data = fs.readFileSync(filename);
      const sha256 = createHash('sha256').update(data).digest('hex');
      expect(sha256).toBe(job.preview.sha256);
      downloads.push({ bytes: data.length, sha256, elapsedMs: Date.now() - started });
    }
    const anon = await browser.newContext();
    expect((await anon.request.get(origin + job.preview.url)).status()).toBe(401);
    await anon.close();
    const range = await recording.request.get(origin + job.preview.url, { headers: { Range: 'bytes=1024-2047' } });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(1024);
    await recording.setOffline(true);
    await expect(page.getByText('Connection interrupted. Your work continues on the server. Reconnecting…')).toBeVisible({ timeout: 15000 });
    await recording.setOffline(false);
    await expect(page.locator('.connection-error')).toHaveCount(0, { timeout: 15000 });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sign out of workspace', exact: true }).click();
    await expect(page.getByLabel('Access code')).toBeVisible();
    expect((await recording.request.get(origin + job.preview.url)).status()).toBe(401);
    expect(errors).toEqual([]);
    const videoFile = page.video();
    await recording.close();
    await videoFile.saveAs(path.join(output, 'rehearsal.webm'));
    const result = { observedAt: new Date().toISOString(), jobId, status: job.status, reviewed: job.preview.reviewed,
      refresh: true, playback: media, seek: true, sources: job.sources.length, downloads,
      anonymousDenied: true, range206: true, reconnect: true, mobile: true, logoutRevokes: true, errors };
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
