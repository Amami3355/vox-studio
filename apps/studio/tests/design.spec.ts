import { expect, test } from '@playwright/test';
import type { Job } from '../src/api';

function filmFixture(): Job {
  const limits = {
    maxCalls: null,
    maxSearches: null,
    maxImages: null,
    maxTakes: null,
    maxImageCorrections: null,
    maxEditorialCorrections: null,
    maxFilmCorrections: null,
    maxTechnicalRepairs: null,
  };
  return {
    id: 'design-review',
    title: 'How reusable rockets find their way home',
    prompt:
      'Explain how a reusable rocket returns to its landing pad. Focus on guidance, engine thrust and the landing burn.',
    duration: 60,
    language: 'English',
    status: 'running',
    createdAt: 1788951600,
    recorded: false,
    message: 'Creating illustrations.',
    runId: 'design-fixture',
    limits,
    remaining: limits,
    usage: {
      maxCalls: 14,
      maxSearches: 2,
      maxImages: 3,
      maxTakes: 1,
      maxImageCorrections: 1,
      maxEditorialCorrections: 0,
      maxFilmCorrections: 0,
      maxTechnicalRepairs: 0,
    },
    continuation: {
      checkpointSha256: 'fixture',
      targets: [],
      refusal: '',
      pending: false,
      requiredLimits: {},
    },
    progress: {
      researchReady: true,
      narrationReady: true,
      planReady: true,
      imagesReady: 1,
      imagesCreated: 3,
      imagesRequired: 2,
      imagesComplete: false,
      renderReady: false,
      reviewReady: false,
      deliveryReady: false,
    },
    corrections: [
      {
        id: 'correction-1',
        target: 'image',
        instruction: 'Show the landing pad clearly.',
        outcome: 'A revised image was approved.',
        identity: 'landing',
      },
    ],
    filmObservations: [
      {
        problem: 'The landing pad needs more contrast.',
        expected: 'Separate the pad from the sea.',
        affectedIds: ['landing'],
        startSeconds: 20,
        endSeconds: 28,
      },
    ],
    events: [
      { sequence: 1, phase: 'research', status: 'completed', summary: 'Research saved.' },
      { sequence: 2, phase: 'narrative', status: 'completed', summary: 'Narration saved.' },
      { sequence: 3, phase: 'recording', status: 'completed', summary: 'Voice saved.' },
      {
        sequence: 4,
        phase: 'image_generation',
        status: 'started',
        summary: 'Creating an illustration.',
      },
    ],
    sources: [
      { title: 'Reusable launch systems: research reference', url: 'https://www.nasa.gov/' },
      { title: 'Landing and recovery: research reference', url: 'https://www.esa.int/' },
    ],
    beats: [
      {
        id: 'opening',
        text: 'Getting a rocket into the sky is only half the journey. Bringing it home begins long before touchdown.',
      },
      {
        id: 'guidance',
        text: 'The guidance system follows the flight path and adjusts the rocket as it descends.',
      },
      {
        id: 'landing',
        text: 'Near the landing pad, the engines slow the descent for a controlled touchdown.',
      },
    ],
    images: [
      {
        identity: 'landing',
        sha256: 'earlier',
        url: '/test-image.png',
        accepted: false,
        assessment: 'The landing pad needs more contrast.',
        meaning: 'Earlier landing illustration',
        observations: [
          {
            problem: 'Pad is hard to see.',
            expected: 'Show the landing pad clearly.',
            affectedIds: ['landing'],
          },
        ],
        requiredLimits: limits,
      },
      {
        identity: 'landing',
        sha256: 'latest',
        url: '/test-image.png',
        accepted: true,
        assessment: 'The pad is clearly visible.',
        meaning: 'Approved landing illustration',
        observations: [],
        requiredLimits: limits,
      },
    ],
    imageProgress: [
      { identity: 'landing', phase: 'image_review', status: 'accepted', observedAt: null },
      { identity: 'guidance', phase: 'image_generation', status: 'running', observedAt: null },
    ],
    awaitingImage: null,
    preview: null,
  };
}

test('production milestones follow the active operation, including corrections to completed work', async ({
  page,
}) => {
  const job = filmFixture();
  await page.route('**/api/session', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/jobs', (route) => route.fulfill({ json: { jobs: [job] } }));
  await page.goto('/?film=design-review');
  const progress = page.getByRole('region', { name: 'Film progress' });
  const current = progress.locator('[aria-current="step"]');
  await expect(current).toContainText('Illustrations');
  await expect(progress.getByText('2 of 5 milestones complete')).toBeVisible();
  await expect(current.getByText('In progress', { exact: true })).toBeVisible();

  job.status = 'blocked';
  job.continuation.targets = ['image'];
  job.blockReason = 'An illustration needs your attention.';
  await page.reload();
  await expect(current).toContainText('Needs attention');
  await expect(progress.getByRole('status')).toContainText(job.blockReason);

  // A later correction can revisit a milestone whose previous output was ready.
  job.status = 'running';
  job.continuation.targets = [];
  job.progress.renderReady = true;
  job.progress.imagesComplete = true;
  job.events.push({
    sequence: 5,
    phase: 'composition',
    status: 'started',
    summary: 'Creating section 2 of 3.',
  });
  await page.reload();
  await expect(current).toContainText('Film');
  await expect(current.getByText('In progress', { exact: true })).toBeVisible();
  await expect(progress.getByRole('status')).toContainText('Creating section 2 of 3.');

  job.status = 'queued';
  await page.reload();
  await expect(current).toHaveCount(0);
  await expect(progress.getByRole('status')).toContainText('Waiting');

  job.status = 'ready';
  job.progress.deliveryReady = true;
  await page.reload();
  await expect(current).toHaveCount(0);
  await expect(progress.getByText('5 of 5 milestones complete')).toBeVisible();
});

test('video details, keyboard tabs, versions and production records remain accessible in both themes', async ({
  page,
}) => {
  const job = filmFixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/session', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/jobs', (route) => route.fulfill({ json: { jobs: [job] } }));
  // Deliberately minimal image fixture: these tests assert access to real content fields, not artwork quality.
  await page.route('**/test-image.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/?film=design-review');
      const info = page.getByRole('region', { name: 'Video information' });
      await expect(info.getByText('60 seconds')).toBeVisible();
      await expect(info.getByText('English')).toBeVisible();
      await info.getByText('View original brief').click();
      await expect(info.getByText(job.prompt)).toBeVisible();
      await info.getByText('View original brief').click();

      const story = page.getByRole('tab', { name: 'Story' });
      await story.focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Sources' })).toBeFocused();
      await expect(page.getByRole('link', { name: /Reusable launch systems/ })).toHaveAttribute(
        'href',
        'https://www.nasa.gov/',
      );
      await page.keyboard.press('End');
      await expect(page.getByRole('tab', { name: 'Images' })).toBeFocused();
      await expect(page.getByRole('img', { name: 'Approved landing illustration' })).toBeVisible();
      expect(
        await page
          .getByRole('img', { name: 'Approved landing illustration' })
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await expect(page.getByRole('img', { name: 'Earlier landing illustration' })).toHaveCount(0);
      await page.getByLabel('Show previous versions').check();
      await expect(page.getByRole('img', { name: 'Earlier landing illustration' })).toBeVisible();

      await page.getByRole('tab', { name: 'Story' }).click();
      for (const beat of job.beats) await expect(page.getByText(beat.text)).toBeVisible();
      await page.getByText('Previous decisions', { exact: false }).click();
      await expect(page.getByText('A revised image was approved.')).toBeVisible();
      await page.getByText('Previous decisions', { exact: false }).click();
      await page.getByText('Film review details', { exact: true }).click();
      await expect(page.getByText('Separate the pad from the sea.')).toBeVisible();
      await page.getByText('Film review details', { exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'Film consumption', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );

      // Check that action labels fit their boxes, including the narrow sidebar.
      const overflowingButtons = await page
        .locator('button:visible, a.primary:visible, a.secondary:visible')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.scrollWidth > button.clientWidth + 1)
            .map((button) => button.textContent),
        );
      expect(overflowingButtons).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `../../.scratch/studio-web-redesign/production-${colorScheme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});
