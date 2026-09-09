import { useEffect, useState } from 'react';
import type { Job } from './api';

const phaseCopy: Record<string, string> = {
  research: 'Finding reliable sources for your story',
  coverage: 'Checking that the research answers your question',
  research_coverage: 'Checking the evidence behind the story',
  narrative: 'Writing the narration',
  composition: 'Designing the visual story',
  scene_author: 'Building the visual sequences',
  art_direction: 'Setting the visual direction',
  image_generation: 'Creating an illustration',
  image_intent: 'Planning the next illustration',
  image_review: 'Verifying the generated illustration',
  recording: 'Recording your narration',
  render: 'Rendering your film',
  compilation: 'Preparing the film with your approved illustrations',
  media_validation: 'Checking the video and audio file',
  film_review: 'Watching and listening to the finished film',
};

export function activitySummary(event: Job['events'][number]) {
  if (['blocked', 'waiting', 'retry'].includes(event.status)) return event.summary;
  if (event.status === 'recovering') return 'The crew is automatically recovering this step.';
  if (
    event.phase === 'composition' &&
    /^(Creating section \d+ of \d+\.|Section \d+ of \d+ is saved\.)$/.test(event.summary)
  )
    return event.summary;
  if (event.phase === 'technical_repair')
    return 'An automatic repair was applied and will be checked.';
  if (event.phase === 'delivery') return 'Your film is ready to watch and download.';
  return (
    phaseCopy[event.phase] ||
    (['accepted', 'completed'].includes(event.status)
      ? 'Step completed and saved.'
      : 'Progress saved.')
  );
}

export function productionMessage(job: Job) {
  const latest = job.events.at(-1);
  if (job.stopRequested && ['running', 'awaiting_image'].includes(job.status))
    return 'Stopping after the current operation. Its result will be saved.';
  if (['blocked', 'interrupted', 'failed'].includes(job.status))
    return (
      job.blockReason ||
      job.continuation.refusal ||
      job.message ||
      'Production paused. Your work is saved.'
    );
  if (job.status === 'running' && latest && ['waiting', 'retry'].includes(latest.status))
    return latest.summary;
  if (
    job.status === 'running' &&
    latest?.phase === 'composition' &&
    /^(Creating section \d+ of \d+\.|Section \d+ of \d+ is saved\.)$/.test(latest.summary)
  )
    return latest.summary;
  if (job.continuation.pending && job.status === 'queued')
    return 'Your correction is saved and waiting for the crew.';
  if (job.status === 'queued') return 'Your brief is saved. Waiting for the production worker.';
  if (job.status === 'awaiting_image')
    return 'Your illustration is ready. Take a look and give it your approval.';
  if (job.continuation.targets.includes('image'))
    return 'An illustration needs a correction. Your narration and approved images are saved.';
  if (job.continuation.targets.includes('continue'))
    return 'Your progress is saved. Resume the next step below.';
  if (job.status === 'running')
    return (
      phaseCopy[job.events.at(-1)?.phase || ''] ||
      'The crew is working on your film. Your progress is saved automatically.'
    );
  if (['blocked', 'interrupted', 'failed'].includes(job.status))
    return (
      job.continuation.refusal ||
      'This step could not finish. Your work is saved while the production is checked.'
    );
  return job.message;
}

export function ProductionProgress({ job }: { job: Job }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (job.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [job.status]);
  const progress = job.progress;
  if (!progress) return null;
  const stages = [
    {
      name: 'Research',
      done: progress.researchReady,
      detail: job.sources.length
        ? `${job.sources.length} sources collected`
        : 'Evidence & understanding',
    },
    {
      name: 'Story & voice',
      done: progress.narrationReady,
      detail: progress.narrationReady
        ? 'Narration recorded'
        : job.beats.length
          ? `${job.beats.length} story beats written`
          : 'A story worth listening to',
    },
    {
      name: 'Illustrations',
      done: progress.imagesComplete ?? progress.renderReady,
      detail:
        progress.imagesRequired != null
          ? `${progress.imagesReady} / ${progress.imagesRequired} approved`
          : progress.imagesCreated
            ? `${progress.imagesReady} approved · ${progress.imagesCreated} created`
            : 'Visuals with a purpose',
    },
    {
      name: 'Film',
      done: progress.renderReady,
      detail: progress.renderReady ? 'Preview available' : 'Composition & rendering',
    },
    {
      name: 'Ready to watch',
      done: progress.deliveryReady ?? progress.reviewReady,
      detail:
        progress.deliveryReady || progress.reviewReady
          ? 'Video & audio file checked'
          : 'Video & audio file checks',
    },
  ];
  const waiting = ['blocked', 'interrupted', 'failed', 'awaiting_image'].includes(job.status);
  return (
    <section className="production-progress" aria-label="Film progress">
      <div className="progress-heading">
        <span className="eyebrow">FROM QUESTION TO FILM</span>
        <span>
          {['ready', 'reviewed'].includes(job.status)
            ? 'Ready to watch'
            : waiting
              ? 'Your next step is below'
              : 'Saved as we go'}
        </span>
      </div>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage.name} className={stage.done ? 'complete' : ''}>
            <span className="stage-marker" aria-label={stage.done ? 'Completed' : 'Not completed'}>
              {stage.done ? '✓' : `0${index + 1}`}
            </span>
            <div>
              <strong>{stage.name}</strong>
              <small>{stage.detail}</small>
            </div>
          </li>
        ))}
      </ol>
      {job.status === 'running' && job.events.at(-1)?.phase === 'render' && job.renderProgress && (
        <div className="render-progress" aria-label="Render activity">
          <strong>
            {
              (
                {
                  bundle: 'Preparing the renderer',
                  composition: 'Preparing the composition',
                  render: 'Rendering frames',
                  encoding: 'Encoding the video',
                  muxing: 'Combining picture and sound',
                  saving: 'Saving the video',
                } as Record<string, string>
              )[job.renderProgress.phase]
            }
          </strong>
          {job.renderProgress.totalFrames !== undefined &&
            job.renderProgress.renderedFrames !== undefined && (
              <span>
                {job.renderProgress.renderedFrames} / {job.renderProgress.totalFrames} frames
                rendered
              </span>
            )}
          {job.renderProgress.encodedFrames !== undefined && (
            <span>{job.renderProgress.encodedFrames} frames encoded</span>
          )}
          <span>{Math.floor(job.renderProgress.elapsedMs / 1000)}s elapsed at last update</span>
          {job.progressConnectionLost && (
            <span>Progress connection interrupted. Checking again…</span>
          )}
        </div>
      )}
      {!!job.imageProgress?.length && !progress.imagesComplete && (
        <ul className="image-progress" aria-label="Illustration activity">
          {job.imageProgress.map((item) => (
            <li key={item.identity}>
              <strong>{item.identity.replaceAll('-', ' ')}</strong>
              <span>
                {item.status === 'accepted'
                  ? 'Approved'
                  : item.status === 'blocked'
                    ? 'Needs attention'
                    : phaseCopy[item.phase] || 'Preparing illustration'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {job.status === 'running' && job.events.at(-1)?.observedAt && (
        <p className="progress-time">
          Latest activity{' '}
          {Math.max(0, Math.floor((now - Date.parse(job.events.at(-1)!.observedAt!)) / 1000))}s ago
          {job.savedAt && ` · Saved at ${new Date(job.savedAt).toLocaleTimeString()}`}
        </p>
      )}
    </section>
  );
}
