import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const headers = { Origin: 'http://127.0.0.1:8781', 'X-Vox-Studio': '1' };
let administration: APIRequestContext;
test.beforeAll(async ({ playwright }) => {
  administration = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8781' });
  const response = await administration.post('/api/session', {
    headers,
    data: { code: 'browser-test-workspace-only' },
  });
  expect(response.status()).toBe(200);
});
test.afterAll(async () => {
  await administration.dispose();
});
test.beforeEach(async () => {
  expect((await administration.post('/api/testing/reset', { headers })).status()).toBe(200);
});

test('film consumption exposes partial costs, saved tokens and a private export on desktop and mobile', async ({
  page,
}) => {
  const { id } = await (await administration.post('/api/testing/consumption', { headers })).json();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?film=${id}`);
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  const panel = page.getByRole('region', { name: 'Film consumption', exact: true });
  await expect(panel.getByText('4 provider calls · 1 image attempt')).toBeVisible();
  await expect(panel.getByText('$1.6050', { exact: true })).toBeVisible();
  await expect(panel.getByText(/1 of 4 calls priced/)).toBeVisible();
  await expect(panel.getByText(/1 call is awaiting/)).toBeVisible();
  await panel.getByText('Production consumption', { exact: true }).click();
  await expect(panel.getByRole('cell', { name: '1,300,000 1/2 calls', exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await panel.getByRole('link', { name: 'Download consumption report' }).click();
  const download = await downloadEvent;
  const exported = await readFile((await download.path()) as string, 'utf8');
  expect(JSON.parse(exported).consumption.estimatedSubtotalUsd).toBe(1.605);
  expect(exported).not.toContain('PRIVATE PROVIDER ANSWER');
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/consumption-desktop.png',
    fullPage: true,
  });
  await administration.post(`/api/testing/consumption-response?job_id=${id}`, { headers });
  await expect(panel.getByText('$3.2100', { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(panel.getByText('$3.2100', { exact: true })).toBeVisible();
  await panel.getByText('Production consumption', { exact: true }).click();
  await expect(panel.getByRole('cell', { name: '2,600,000', exact: true })).toBeVisible();
  const scroll = panel.getByRole('region', { name: 'Consumption by model and role' });
  await scroll.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/consumption-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('private workspace saves a brief and reconnects to the same work after refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to the studio.' })).toBeVisible();
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await expect(page.getByRole('heading', { name: /Every great film/ })).toBeVisible();
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/new-film-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /Why is the sky blue/ }).click();
  await expect(page.getByLabel('What would you like to explain?')).toHaveValue(
    'Explain why the sky is blue.',
  );
  await page.getByRole('button', { name: 'Create a film' }).click();
  await expect(page.getByRole('heading', { name: 'Explain why the sky is blue.' })).toBeVisible();
  await expect(
    page.getByText('Your brief is saved. Waiting for the production worker.'),
  ).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Explain why the sky is blue.' })).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(
    page.getByRole('navigation', { name: 'Your films' }).getByRole('button'),
  ).toHaveCount(1);
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect(
    page.getByRole('heading', { name: 'Good stories have good sources.' }),
  ).toBeVisible();
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/saved-brief-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Explain why the sky is blue.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'New film' }).click();
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/new-film-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('anonymous browser cannot open a production or its media', async ({ request }) => {
  const response = await request.get('/api/jobs');
  expect(response.status()).toBe(401);
  const media = await request.get(`/api/jobs/unknown/media/${'0'.repeat(64)}`);
  expect(media.status()).toBe(401);
});

test('parallel image activity advances to measured rendering and technical delivery', async ({
  page,
}) => {
  const seed = await administration.post('/api/testing/progress', { headers });
  const { id } = await seed.json();
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await page.getByRole('navigation', { name: 'Your films' }).getByRole('button').click();
  const activity = page.getByRole('list', { name: 'Illustration activity' });
  await expect(activity.getByText('Creating an illustration')).toBeVisible();
  await expect(activity.getByText('Verifying the generated illustration')).toBeVisible();
  await expect(page.getByText('0 / 2 approved')).toBeVisible();
  await administration.post('/api/testing/progress?phase=render', { headers });
  await expect(page.getByText('120 / 300 frames rendered')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('90 frames encoded')).toBeVisible();
  await expect(activity).toHaveCount(0);
  await expect(page.getByText('2 / 2 approved')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await administration.post('/api/testing/progress?phase=ready', { headers });
  await expect(page.getByText('Film ready · Illustrations approved')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText('Final review', { exact: true })).toHaveCount(0);
  const result = await administration.get(`/api/jobs/${id}`);
  expect((await result.json()).preview).toMatchObject({ ready: true, reviewed: false });
});

test('a lost admission response survives refresh without a duplicate brief', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  const prompt = 'Explain why a compass points north. Lost-response rehearsal.';
  await page.getByLabel('What would you like to explain?').fill(prompt);
  await page.getByLabel('Target duration').selectOption('300');
  let admittedId = '';
  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    admittedId = (await response.json()).id;
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Create a film' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/jobs');
  await page.reload();
  await expect(page.getByLabel('What would you like to explain?')).toHaveValue(prompt);
  await expect(page.getByLabel('Target duration')).toHaveValue('300');
  await page.getByRole('button', { name: 'Create a film' }).click();
  await expect(page).toHaveURL(new RegExp(`film=${admittedId}$`));
  const jobs = await (await page.request.get('/api/jobs')).json();
  expect(jobs.jobs.filter((job: { prompt: string }) => job.prompt === prompt)).toHaveLength(1);
  expect(jobs.jobs.find((job: { id: string }) => job.id === admittedId).duration).toBe(300);
});

test('an initial session connection failure offers recovery', async ({ page }) => {
  await page.route('**/api/session', (route) => route.abort('connectionreset'));
  await page.goto('/');
  await expect(page.getByText('Unable to reach the Studio server.')).toBeVisible();
  await page.unroute('**/api/session');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Access code')).toBeVisible();
});

test('new films have no spending form and a queued film can be stopped durably', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await page.getByLabel('What would you like to explain?').fill('Explain tides.');
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create a film' }).click();
  await expect(page.getByRole('heading', { name: 'Explain tides.' })).toBeVisible();
  await page.reload();
  await page.getByText('Production consumption', { exact: true }).click();
  await expect(
    page.getByRole('row', { name: 'Total image generations 0', exact: true }),
  ).toBeVisible();
  const { jobs } = await (await page.request.get('/api/jobs')).json();
  expect(Object.values(jobs[0].limits).every((value) => value === null)).toBe(true);
  await page.getByRole('button', { name: 'Stop after current operation' }).click();
  await expect(page.getByRole('button', { name: 'Start production' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start production' })).toBeVisible();
});

test('detailed rejection and correction survive a lost response and refresh without a duplicate', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await expect(page.getByLabel('What would you like to explain?')).toBeVisible();
  const { id } = await (await page.request.post('/api/testing/blocked', { headers })).json();
  await page.goto(`/?film=${id}`);
  await expect(page.getByRole('heading', { name: 'Correct this illustration' })).toBeVisible();
  await expect(page.getByText('Use a continuous beam for light.', { exact: true })).toBeVisible();
  await page.getByText('Add your direction', { exact: false }).click();
  await page.getByLabel('Correction instructions').fill('Draw light as a continuous beam.');
  await page.route(`**/api/jobs/${id}/resume`, async (route) => {
    expect((await route.fetch()).status()).toBe(202);
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Correct illustration and continue' }).click();
  await expect(page.getByRole('button', { name: 'Confirm saved request' })).toBeVisible();
  await page.unroute(`**/api/jobs/${id}/resume`);
  await page.reload();
  await page.getByRole('button', { name: 'Confirm saved request' }).click();
  await expect(page.getByRole('button', { name: 'Confirm saved request' })).toHaveCount(0);
  const job = await (await page.request.get(`/api/jobs/${id}`)).json();
  expect(job.status).toBe('queued');
  expect(job.continuation.pending).toBe(true);
  expect(job.usage.maxCalls).toBe(23);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('stalled repair explains the section failure even when continuation is unavailable', async ({
  page,
}) => {
  const { id } = await (
    await administration.post('/api/testing/model-response?stalled=true', { headers })
  ).json();
  const reason = 'The scene selection does not match the section being prepared.';
  await page.goto(`/?film=${id}`);
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  const controls = page.getByRole('region', { name: 'Production decisions' });
  await expect(controls.getByRole('status')).toContainText(reason);
  await expect(
    controls.getByText(/A technical correction is needed before resuming/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue production' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(controls.getByRole('status')).toContainText(reason);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('exhausted response recovery continues without an editorial instruction', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await expect(page.getByLabel('What would you like to explain?')).toBeVisible();
  const { id } = await (await page.request.post('/api/testing/model-response', { headers })).json();
  await page.goto(`/?film=${id}`);
  await expect(page.getByRole('heading', { name: 'Resume production' })).toBeVisible();
  await expect(page.locator('.production-controls').getByRole('status')).toContainText(
    'Production paused:',
  );
  await expect(page.getByLabel('Correction instructions')).toHaveCount(0);
  await expect(page.getByLabel('What needs to change?')).toHaveCount(0);
  await expect(page.getByText(/SceneAuthor|ContractViolation|JSON private/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Allow \+/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue production' }).click();
  await expect(page.getByRole('heading', { name: 'Resume production' })).toHaveCount(0);
  const job = await (await page.request.get(`/api/jobs/${id}`)).json();
  expect(job.status).toBe('queued');
  expect(job.usage.maxTechnicalRepairs).toBe(2);
  expect(job.usage.maxCalls).toBe(10);
});

test('an exhausted historical image queues the suggested correction without a new budget', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Access code').fill('browser-test-workspace-only');
  await page.getByRole('button', { name: 'Enter studio' }).click();
  await expect(page.getByLabel('What would you like to explain?')).toBeVisible();
  const { id } = await (await page.request.post('/api/testing/blocked', { headers })).json();
  await page.goto(`/?film=${id}`);
  await expect(
    page.getByRole('button', { name: 'Correct illustration and continue' }),
  ).toBeEnabled();
  await expect(page.getByText('Allow the next step', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Correction instructions')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/guided-correction-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: '../../.scratch/hackathon-launch/runtime/studio-browser-tests/guided-correction-desktop.png',
    fullPage: true,
  });
  let requests = 0;
  await page.route(`**/api/jobs/${id}/resume`, async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body.correction.instruction).toBe('Use a continuous beam for light.');
    expect(body.limits).toBeUndefined();
    await route.continue();
  });
  await page.getByRole('button', { name: 'Correct illustration and continue' }).click();
  await expect(page.getByText('Your decision is saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your decision is saved', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});
