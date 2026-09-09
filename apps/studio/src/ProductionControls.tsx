import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from './api';
import type { Job, ProductionLimits } from './api';

export const limitLabels: Record<keyof ProductionLimits, string> = {
  maxImages: 'Total image generations',
  maxCalls: 'Total provider calls',
  maxSearches: 'Research searches',
  maxTakes: 'Narration recordings',
  maxImageCorrections: 'Corrections per image',
  maxEditorialCorrections: 'Editorial correction cycles',
  maxFilmCorrections: 'Film visual correction cycles',
  maxTechnicalRepairs: 'Technical repair attempts',
};
const targetLabels: Record<string, string> = {
  image: 'Correct this illustration',
  visuals: 'Improve the film visuals',
  research: 'Extend the research',
  narrative: 'Revise the narration',
  composition: 'Refine the visual plan',
  continue: 'Resume production',
};

function readAttempt(jobId: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(`vox-studio-correction-${jobId}`) || 'null');
    return value && typeof value.payload === 'string' && typeof value.key === 'string'
      ? (value as { payload: string; key: string })
      : null;
  } catch {
    return null;
  }
}

function suggestedCorrection(image: Job['images'][number] | undefined) {
  return [...new Set(image?.observations.map((item) => item.expected).filter(Boolean) || [])]
    .join('\n')
    .slice(0, 1200);
}

export function ProductionControls({ job, refresh }: { job: Job; refresh: () => void }) {
  const rejected = job.images.filter(
    (image, index, all) =>
      !image.accepted && !all.slice(index + 1).some((later) => later.identity === image.identity),
  );
  const [target, setTarget] = useState(
    !job.continuation.targets.includes('continue') && job.continuation.targets.includes('image')
      ? 'image'
      : job.continuation.targets[0] || 'continue',
  );
  const [identity, setIdentity] = useState(rejected.at(-1)?.identity || '');
  const selected = rejected.find((image) => image.identity === identity);
  const suggestion = suggestedCorrection(selected);
  const [instruction, setInstruction] = useState(() => {
    try {
      return sessionStorage.getItem(`vox-studio-correction-draft-${job.id}`) || '';
    } catch {
      return '';
    }
  });
  const [attempt, setAttempt] = useState(() => readAttempt(job.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    setAttempt(readAttempt(job.id));
  }, [job]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const pendingOnServer = job.continuation.pending && job.status === 'interrupted';
  const canResume = job.continuation.targets.length > 0 && !pendingOnServer;
  const canStart = job.status === 'awaiting_authorization' && !job.recorded;
  const effectiveInstruction =
    target === 'continue' ? '' : instruction.trim() || (target === 'image' ? suggestion : '');
  const ready = canStart || target === 'continue' || Boolean(effectiveInstruction);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || (!attempt && !ready)) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = canStart
        ? JSON.stringify({})
        : JSON.stringify({
            checkpointSha256: job.continuation.checkpointSha256,
            correction: {
              target,
              instruction: effectiveInstruction,
              identity: target === 'image' ? selected?.identity : null,
              candidateSha256: target === 'image' ? selected?.sha256 : null,
            },
          });
      const next = attempt || { payload, key: crypto.randomUUID() };
      sessionStorage.setItem(`vox-studio-correction-${job.id}`, JSON.stringify(next));
      setAttempt(next);
      const endpoint = 'correction' in JSON.parse(next.payload) ? 'resume' : 'start';
      await api(`/jobs/${job.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': next.key },
        body: next.payload,
      });
      sessionStorage.removeItem(`vox-studio-correction-${job.id}`);
      sessionStorage.removeItem(`vox-studio-correction-draft-${job.id}`);
      setAttempt(null);
      setInstruction('');
      refresh();
    } catch (caught) {
      if (caught instanceof ApiError && [409, 422].includes(caught.status)) {
        sessionStorage.removeItem(`vox-studio-correction-${job.id}`);
        setAttempt(null);
        refresh();
      }
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save your decision. Please try again.',
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    setError('');
    try {
      await api(`/jobs/${job.id}/stop`, { method: 'POST' });
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to stop production.');
    } finally {
      setBusy(false);
    }
  }
  async function retrySaved() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/jobs/${job.id}/retry-continuation`, { method: 'POST' });
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to retry.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const errorMessage = error && (
    <p ref={errorRef} tabIndex={-1} role="alert" className="error">
      {error}
    </p>
  );
  return (
    <section
      className={`production-controls ${canResume || canStart || attempt ? 'has-decision' : ''}`}
      aria-label="Production decisions"
    >
      {['blocked', 'interrupted'].includes(job.status) && job.blockReason && (
        <p>
          <output>Production paused: {job.blockReason}</output>
        </p>
      )}
      {!job.recorded && ['queued', 'running', 'awaiting_image'].includes(job.status) && (
        <div className="decision-footer">
          <button
            type="button"
            className="secondary"
            disabled={busy || job.stopRequested}
            onClick={stop}
          >
            {job.stopRequested
              ? 'Stopping after the current operation?'
              : 'Stop after current operation'}
          </button>
          <p>The current result will be saved. You can resume later.</p>
          {errorMessage}
        </div>
      )}
      {job.continuation.pending && ['queued', 'running'].includes(job.status) && !attempt && (
        <div className="decision-confirmed" aria-live="polite">
          <span className="decision-symbol">✓</span>
          <div>
            <strong>Your decision is saved</strong>
            <p>
              {job.status === 'queued'
                ? 'Waiting for the crew to pick up your correction. You can safely leave this page.'
                : 'The crew is continuing your film. Your existing work is saved.'}
            </p>
          </div>
        </div>
      )}
      {pendingOnServer && (
        <div className="resume-pending">
          <span className="eyebrow">YOUR DECISION IS SAVED</span>
          <h2>Reconnect your production</h2>
          <p>Your correction was received. Resume verification to continue from the saved work.</p>
          <button type="button" className="primary" disabled={busy} onClick={retrySaved}>
            {busy ? 'Reconnecting…' : 'Resume saved correction'}
          </button>
          {errorMessage}
        </div>
      )}
      {(canResume || canStart || attempt) && (
        <form className="correction-form" onSubmit={submit} aria-busy={busy}>
          <div className="decision-heading">
            <span className="eyebrow">
              {canStart ? 'READY WHEN YOU ARE' : 'LET’S KEEP YOUR FILM MOVING'}
            </span>
            <h2>
              {canStart ? 'Bring your story to life' : targetLabels[target] || 'Resume production'}
            </h2>
            <p>
              {canStart
                ? 'Let the crew create, check and correct your film automatically.'
                : target === 'image'
                  ? 'One illustration needs another pass. Review the suggested direction below.'
                  : 'Continue from your saved work. Completed narration and approved images are retained.'}
            </p>
          </div>
          {attempt ? (
            <div className="resume-pending">
              <strong>Checking that your decision was received</strong>
              <p>
                Retry safely to confirm the same request. It will not create a duplicate correction.
              </p>
            </div>
          ) : (
            <fieldset className="decision-fields" disabled={busy}>
              {!canStart && job.continuation.targets.length > 1 && (
                <details className="alternative-action">
                  <summary>Choose a different action</summary>
                  <label>
                    What needs to change?
                    <select
                      value={target}
                      onChange={(event) => {
                        setTarget(event.target.value);
                        setInstruction('');
                        setError('');
                      }}
                    >
                      {job.continuation.targets.map((value) => (
                        <option key={value} value={value}>
                          {targetLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
              )}
              {target === 'image' && selected && (
                <>
                  {rejected.length > 1 && (
                    <label>
                      Illustration to correct
                      <select
                        value={identity}
                        onChange={(event) => {
                          setIdentity(event.target.value);
                          setInstruction('');
                        }}
                      >
                        {rejected.map((image, index) => (
                          <option key={image.identity} value={image.identity}>
                            Illustration {index + 1} · {image.meaning}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="correction-preview">
                    <div className="correction-image">
                      <img src={selected.url} alt={selected.meaning || 'Illustration to correct'} />
                      <span className="image-version">Latest version · needs a correction</span>
                    </div>
                    <div className="correction-copy">
                      <span className="eyebrow">THE NEXT PASS</span>
                      <h3>A clearer illustration</h3>
                      <p className="suggested-correction">{suggestion || selected.assessment}</p>
                      <details className="review-detail">
                        <summary>Why this needs a correction</summary>
                        <p>{selected.assessment}</p>
                        {selected.observations.map((item, index) => (
                          <p key={`${item.problem}-${index}`}>{item.problem}</p>
                        ))}
                      </details>
                    </div>
                  </div>
                  <details
                    className="instruction-details"
                    open={Boolean(instruction) || !suggestion}
                  >
                    <summary>
                      Add your direction <span>Optional</span>
                    </summary>
                    <label>
                      Correction instructions
                      <textarea
                        value={instruction}
                        maxLength={1200}
                        rows={3}
                        placeholder={suggestion || 'Describe what you would like to change.'}
                        onChange={(event) => {
                          setInstruction(event.target.value);
                          sessionStorage.setItem(
                            `vox-studio-correction-draft-${job.id}`,
                            event.target.value,
                          );
                        }}
                      />
                    </label>
                    <p>
                      Your direction replaces the suggested correction. The crew also receives the
                      review findings.
                    </p>
                  </details>
                </>
              )}
              {!canStart && !['image', 'continue'].includes(target) && (
                <label>
                  Your direction
                  <textarea
                    value={instruction}
                    maxLength={1200}
                    rows={3}
                    required
                    placeholder="What would make this film better?"
                    onChange={(event) => setInstruction(event.target.value)}
                  />
                </label>
              )}
              <p className="decision-footnote">
                {job.progress.imagesCreated} images saved · {job.usage.maxImages} generation
                attempts. Production has no spending ceiling.
              </p>
            </fieldset>
          )}
          <div className="decision-footer">
            {errorMessage}
            <button type="submit" className="primary" disabled={busy || (!attempt && !ready)}>
              {busy
                ? 'Saving your decision…'
                : attempt
                  ? 'Confirm saved request'
                  : canStart
                    ? 'Start production'
                    : target === 'image'
                      ? 'Correct illustration and continue'
                      : 'Continue production'}
              <span aria-hidden="true">→</span>
            </button>
            <p>Your work stays saved. You can stop after the current operation.</p>
          </div>
        </form>
      )}
      {!canResume && job.continuation.refusal && (
        <p className="continuation-refusal">{job.continuation.refusal}</p>
      )}
      <details className="usage-details">
        <summary>Production consumption</summary>
        <div className="usage-scroll">
          <table>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Used</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(limitLabels) as (keyof ProductionLimits)[]).map((name) => (
                <tr key={name}>
                  <th>{limitLabels[name]}</th>
                  <td>{job.usage[name]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {job.filmObservations.length > 0 && (
        <details className="review-detail">
          <summary>Film review details</summary>
          {job.filmObservations.map((item, index) => (
            <p key={`${item.problem}-${index}`}>
              <strong>{item.problem}</strong>
              <br />
              {item.expected}
            </p>
          ))}
        </details>
      )}
      {job.corrections.length > 0 && (
        <details>
          <summary>Previous decisions · {job.corrections.length}</summary>
          {job.corrections.map((correction) => (
            <p key={correction.id}>
              <strong>{targetLabels[correction.target]}</strong>
              <br />
              {correction.instruction || 'Resume saved work'}
              <br />
              <small>
                {correction.outcome || 'Instruction saved; see production history for results.'}
              </small>
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
