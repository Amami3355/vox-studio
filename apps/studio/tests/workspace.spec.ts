import { expect, test } from '@playwright/test';

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
    page.getByText('The brief is saved. An operator must authorize its production budget.'),
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
