import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ProductionControls } from './ProductionControls';
import { ProductionProgress, activitySummary, productionMessage } from './ProductionProgress';
import { ApiError, api, statusLabels } from './api';
import type { Job } from './api';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    film: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    source: (
      <>
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    logout: (
      <>
        <path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.film}
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="brand-icon">
        <i />
        <i />
        <i />
        <i />
      </span>
      vox<span className="wordmark-light">studio</span>
      <span className="brand-dot">.</span>
    </span>
  );
}
const examples = [
  {
    category: 'THE EVERYDAY, EXPLAINED',
    title: 'Why is the sky blue?',
    text: 'Explain why the sky is blue.',
    className: 'sky-art',
    mark: '01',
  },
  {
    category: 'BIG IDEAS, SMALL FILMS',
    title: 'How do rockets land?',
    text: 'Explain how reusable rockets land safely.',
    className: 'rocket-art',
    mark: '02',
  },
  {
    category: 'FOLLOW YOUR CURIOSITY',
    title: 'Make a complex idea click.',
    text: '',
    className: 'idea-art',
    mark: '03',
  },
];

function Login({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/session', { method: 'POST', body: JSON.stringify({ code }) });
      onLogin();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-story">
        <Wordmark />
        <div>
          <span className="eyebrow">A SMALL STUDIO FOR BIG QUESTIONS</span>
          <h1>
            Make understanding
            <br />
            <em>visible.</em>
          </h1>
          <p>A question. A researched story. A film that makes it click.</p>
          <div className="login-orbit" aria-hidden="true">
            <span />
            <i />
            <b />
          </div>
        </div>
        <span className="login-caption">RESEARCH → STORY → PICTURE → SOUND</span>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <div className="lock-circle">
            <Icon name="lock" size={24} />
          </div>
          <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
          <h2>Welcome to the studio.</h2>
          <p>Enter your access code to pick up where you left off.</p>
          <label htmlFor="access-code">Access code</label>
          <input
            id="access-code"
            autoComplete="current-password"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Opening workspace…' : 'Enter studio'}
            <Icon name="arrow" />
          </button>
          <small>
            <Icon name="lock" size={13} /> Your briefs and films stay in this workspace.
          </small>
        </form>
      </div>
    </main>
  );
}

const pendingSubmissionKey = 'vox-studio-pending-submission';
type SubmissionAttempt = { payload: string; key: string };

function readPendingSubmission() {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(pendingSubmissionKey) || 'null');
    if (!attempt || typeof attempt.payload !== 'string' || typeof attempt.key !== 'string')
      return null;
    const request = JSON.parse(attempt.payload);
    if (
      typeof request.text !== 'string' ||
      !Number.isInteger(request.duration) ||
      request.duration < 30 ||
      request.duration > 300 ||
      !['English', 'French'].includes(request.language)
    )
      return null;
    return { attempt: attempt as SubmissionAttempt, request };
  } catch {
    return null;
  }
}

function NewFilm({ onCreated }: { onCreated: (job: Job) => void }) {
  const [pending] = useState(readPendingSubmission);
  const [text, setText] = useState<string>(pending?.request.text || '');
  const [duration, setDuration] = useState<number>(pending?.request.duration || 50);
  const [language, setLanguage] = useState<string>(pending?.request.language || 'English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<SubmissionAttempt | null>(pending?.attempt || null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const payload = JSON.stringify({ text: text.trim(), duration, language });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      // Persist before admission: a lost response and refresh must reuse the same key.
      sessionStorage.setItem(pendingSubmissionKey, JSON.stringify(attempt.current));
      const job = await api<Job>('/jobs', {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.current.key },
        body: payload,
      });
      sessionStorage.removeItem(pendingSubmissionKey);
      attempt.current = null;
      onCreated(job);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save this brief.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="new-film">
      <div className="intro">
        <span className="eyebrow">
          <span className="orange-line" /> FROM CURIOSITY TO CLARITY
        </span>
        <h1>
          Every great film starts
          <br />
          with a <em>good question.</em>
        </h1>
        <p>
          Bring an idea. Your crew will research it, shape the story,
          <br className="desktop-break" /> and turn it into a narrated visual explainer.
        </p>
      </div>
      <form className="brief-card" onSubmit={submit}>
        <label htmlFor="brief">
          What would you like to explain?<span>THE BRIEF</span>
        </label>
        <textarea
          ref={input}
          id="brief"
          placeholder="Why is the sky blue? How does a rocket find its way home?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          required
          rows={3}
        />
        <div className="brief-toolbar">
          <div className="brief-options">
            <label>
              <Icon name="clock" size={16} />
              <select
                aria-label="Target duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={30}>30 seconds</option>
                <option value={50}>50 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
                <option value={240}>4 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </label>
            <label>
              <span className="language-icon">Aa</span>
              <select
                aria-label="Narration language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option>English</option>
                <option>French</option>
              </select>
            </label>
          </div>
          <button type="submit" className="primary" disabled={!text.trim() || busy}>
            {busy ? 'Saving brief…' : 'Create a film'}
            <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="creation-promise">
          <span>Research-backed story</span>
          <span>Images checked automatically</span>
          <span>Narrated film</span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="brief-note">
        <Icon name="lock" size={13} /> Your brief and progress are saved. The crew checks and
        corrects your film automatically; you can stop after the current operation.
      </p>
      <div className="section-label">
        <h2>A little inspiration</h2>
        <span>START WITH A QUESTION</span>
      </div>
      <div className="example-grid">
        {examples.map((example) => (
          <button
            type="button"
            className="example"
            key={example.mark}
            onClick={() => {
              setText(example.text);
              input.current?.focus();
            }}
          >
            <div className={`example-art ${example.className}`} aria-hidden="true">
              <span className="art-number">{example.mark}</span>
              <div className="orbital" />
              <div className="art-line" />
              <span className="art-caption">
                {example.mark === '01'
                  ? 'LIGHT / ATMOSPHERE'
                  : example.mark === '02'
                    ? 'GRAVITY / THRUST'
                    : 'QUESTION / DISCOVERY'}
              </span>
            </div>
            <div className="example-copy">
              <span>{example.category}</span>
              <h3>
                {example.title}
                <Icon name="arrow" size={17} />
              </h3>
            </div>
          </button>
        ))}
      </div>
      <div className="process-note">
        <span>THOUGHTFULLY MADE, STEP BY STEP</span>
        <div>
          <span>
            01 <b>Research</b>
          </span>
          <i />
          <span>
            02 <b>Story</b>
          </span>
          <i />
          <span>
            03 <b>Visuals</b>
          </span>
          <i />
          <span>
            04 <b>Your film</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function Film({ job, refresh }: { job: Job; refresh: () => void }) {
  const [tab, setTab] = useState('story');
  const [showImageHistory, setShowImageHistory] = useState(false);
  const latestImages = job.images.filter(
    (image, index, all) => !all.slice(index + 1).some((later) => later.identity === image.identity),
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(accepted: boolean) {
    if (!job.awaitingImage) return;
    setBusy(true);
    setError('');
    try {
      await api(`/jobs/${job.id}/image-decision`, {
        method: 'POST',
        body: JSON.stringify({ sha256: job.awaitingImage.sha256, accepted, reason }),
      });
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save your decision.');
    } finally {
      setBusy(false);
    }
  }
  const active = ['queued', 'running', 'awaiting_image'].includes(job.status);
  return (
    <div className="film-workspace">
      <div className="film-heading">
        <div>
          <span className="eyebrow">
            {job.recorded ? 'SAVED PRODUCTION · RECORDED' : 'YOUR PRODUCTION'}
          </span>
          <h1>{job.title}</h1>
          <p>
            {job.duration}s target<span>·</span>
            {job.language}
            <span>·</span>
            {new Date(job.createdAt * 1000).toLocaleDateString('en', {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
        <span className={`status status-${job.status}`}>
          {active && <span className="live-dot" />}
          {statusLabels[job.status] || job.status}
        </span>
      </div>
      <ProductionProgress job={job} />
      <div className="production-grid">
        <div className="film-main">
          {!job.preview && (
            <ProductionControls
              key={`${job.status}:${job.corrections.length}`}
              job={job}
              refresh={refresh}
            />
          )}
          {(job.preview || (!job.continuation.targets.length && !job.awaitingImage)) && (
            <div className="player-shell">
              {job.preview ? (
                // biome-ignore lint/a11y/useMediaCaption: The Story tab exposes the full narration; verified timed captions are not yet available.
                <video
                  key={job.preview.sha256}
                  src={job.preview.url}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label="Produced film preview"
                />
              ) : (
                <div className="player-empty">
                  <div className="empty-film">
                    <Icon name="film" size={34} />
                  </div>
                  <h2>{active ? 'Your story is taking shape.' : 'Your film will appear here.'}</h2>
                  <p>
                    {active
                      ? 'Follow the crew’s progress. You can safely leave and come back.'
                      : 'Your brief and progress are saved in this workspace.'}
                  </p>
                  <span>RESEARCHED. NARRATED. MADE TO EXPLAIN.</span>
                </div>
              )}
            </div>
          )}
          {job.preview && (
            <div className="player-caption">
              <span className={job.preview.ready || job.preview.reviewed ? 'accepted-text' : 'draft-text'}>
                {job.preview.ready || job.preview.reviewed
                  ? 'Film ready · Illustrations approved'
                  : 'Rendered preview · File checks in progress'}
              </span>
              <a href={`${job.preview.url}?download=true`}>
                <Icon name="download" size={16} /> Download
              </a>
            </div>
          )}
          {job.message && !job.continuation.targets.length && !job.awaitingImage && (
            <div className={`notice ${active ? '' : 'attention'}`}>
              <Icon name={active ? 'clock' : 'lock'} size={19} />
              <div>
                <strong>{statusLabels[job.status] || 'Production update'}</strong>
                <p>{productionMessage(job)}</p>
              </div>
            </div>
          )}
          {job.awaitingImage && (
            <section className="image-decision">
              <span className="eyebrow">A MOMENT FOR YOUR EYE</span>
              <h2>Does this image tell the right story?</h2>
              <img src={job.awaitingImage.url} alt={job.awaitingImage.meaning} />
              <p>{job.awaitingImage.meaning}</p>
              <label htmlFor="image-feedback">
                What should change? <span>(required to reject)</span>
              </label>
              <textarea
                id="image-feedback"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() => decide(false)}
                >
                  Request a correction
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  <Icon name="check" size={17} /> Approve image
                </button>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </section>
          )}
          {job.preview && (
            <ProductionControls
              key={`${job.status}:${job.corrections.length}`}
              job={job}
              refresh={refresh}
            />
          )}
          <section className="details-panel">
            <div className="tabs" role="tablist" aria-label="Production details">
              {[
                ['story', 'Story', job.beats.length],
                ['sources', 'Sources', job.sources.length],
                ['images', 'Images', latestImages.length],
              ].map(([id, label, count]) => (
                <button
                  type="button"
                  key={id}
                  role="tab"
                  id={`tab-${id}`}
                  aria-controls={`panel-${id}`}
                  aria-selected={tab === id}
                  onClick={() => setTab(String(id))}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              className="tab-content"
            >
              {tab === 'story' &&
                (job.beats.length ? (
                  job.beats.map((beat, index) => (
                    <div className="beat" key={beat.id}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <p>{beat.text}</p>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="The story starts with research."
                    text="The actual narration will appear here once it has been written."
                  />
                ))}
              {tab === 'sources' &&
                (job.sources.length ? (
                  job.sources.map((source, index) => (
                    <a
                      className="source-row"
                      href={source.url}
                      key={`${source.url}-${index}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="source" size={18} />
                      <span>
                        <b>{source.title}</b>
                        <small>{new URL(source.url).hostname}</small>
                      </span>
                      <Icon name="arrow" size={17} />
                    </a>
                  ))
                ) : (
                  <Empty
                    title="Good stories have good sources."
                    text="Research citations will appear here as the crew gathers evidence."
                  />
                ))}
              {tab === 'images' &&
                (job.images.length ? (
                  <div>
                    <label className="history-toggle">
                      <input
                        type="checkbox"
                        checked={showImageHistory}
                        onChange={(event) => setShowImageHistory(event.target.checked)}
                      />{' '}
                      Show previous versions
                    </label>
                    <div className="image-grid">
                      {(showImageHistory ? job.images : latestImages).map((image, index) => (
                        <figure key={`${image.sha256}-${index}`}>
                          <img
                            src={image.url}
                            alt={image.meaning || image.identity}
                            loading="lazy"
                          />
                          <figcaption>
                            <span className={image.accepted ? 'accepted-text' : 'draft-text'}>
                              {image.reviewPending
                                ? 'Verification pending'
                                : image.accepted
                                  ? 'Accepted'
                                  : 'Rejected'}
                            </span>
                            <p>{image.meaning || image.identity}</p>
                            <details className="review-detail">
                              <summary>Review details</summary>
                              <small>{image.assessment}</small>
                              {image.observations.map((observation, index) => (
                                <p key={`${observation.problem}-${index}`}>
                                  <strong>{observation.problem}</strong>
                                  <br />
                                  {observation.expected}
                                </p>
                              ))}
                            </details>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Empty
                    title="A visual story, built with intention."
                    text="Generated candidates and their review decisions will appear here."
                  />
                ))}
            </div>
          </section>
        </div>
        <aside className="activity">
          <div className="activity-heading">
            <h2>Production notes</h2>
            <span className={active ? 'live-indicator' : 'saved-indicator'}>
              {active ? 'LIVE' : 'SAVED'}
            </span>
          </div>
          <p>Real steps from your crew.</p>
          <ol>
            <li className="activity-event">
              <span className="event-dot done">
                <Icon name="check" size={11} />
              </span>
              <strong>Brief saved</strong>
              <p>{job.prompt}</p>
            </li>
            {job.events
              .filter((event, index, all) => event.phase !== all[index + 1]?.phase)
              .map((event) => (
                <li className="activity-event" key={event.sequence}>
                  <span
                    className={`event-dot ${['accepted', 'completed'].includes(event.status) ? 'done' : ''}`}
                  />{' '}
                  <strong>{event.phase.replaceAll('_', ' ')}</strong>
                  <p>{activitySummary(event)}</p>
                </li>
              ))}
          </ol>
          <div className="saved-note">
            <Icon name="lock" size={15} />
            <span>
              Your work is saved.
              <br />
              Come back whenever you’re ready.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-details">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('film'),
  );
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => {
    void sessionRevision;
    let disposed = false;
    setError('');
    api('/session')
      .then(() => {
        if (!disposed) setAuthenticated(true);
      })
      .catch((error) => {
        if (disposed) return;
        if (error instanceof ApiError && error.status === 401) setAuthenticated(false);
        else setError('Unable to reach the Studio server.');
      });
    return () => {
      disposed = true;
    };
  }, [sessionRevision]);
  useEffect(() => {
    if (!authenticated) return;
    void revision;
    let disposed = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api<{ jobs: Job[] }>('/jobs', { signal: controller.signal });
        if (!disposed) {
          setJobs(data.jobs);
          setError('');
        }
      } catch (error) {
        if (!disposed) {
          if (error instanceof ApiError && error.status === 401) setAuthenticated(false);
          else setError('Connection interrupted. Your work continues on the server. Reconnecting…');
        }
      }
      if (!disposed) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [authenticated, revision]);
  function select(id: string | null) {
    setSelected(id);
    history.replaceState(null, '', id ? `?film=${id}` : location.pathname);
  }
  async function logout() {
    try {
      await api('/session', { method: 'DELETE' });
      sessionStorage.removeItem(pendingSubmissionKey);
      setAuthenticated(false);
      setJobs([]);
    } catch {
      setError('Sign out failed. Please try again.');
    }
  }
  if (authenticated === null)
    return (
      <div className="loading">
        <Wordmark />
        <p role={error ? 'alert' : undefined}>{error || 'Opening your workspace…'}</p>
        {error && (
          <button
            type="button"
            className="secondary"
            onClick={() => setSessionRevision((r) => r + 1)}
          >
            Try again
          </button>
        )}
      </div>
    );
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
  const current = jobs.find((job) => job.id === selected);
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            select(null);
          }}
          aria-label="Vox Studio home"
        >
          <Wordmark />
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">V</span>
          <span>
            Private workspace<small>YOUR CREATIVE SPACE</small>
          </span>
          <Icon name="lock" size={14} />
        </div>
        <button type="button" className="new-button" onClick={() => select(null)}>
          <Icon name="plus" size={18} /> New film<span>↗</span>
        </button>
        <div className="library-heading">
          <span>YOUR FILMS</span>
          <span>{jobs.length.toString().padStart(2, '0')}</span>
        </div>
        <nav aria-label="Your films">
          {jobs.length ? (
            jobs.map((job) => (
              <button
                type="button"
                className={`library-item ${selected === job.id ? 'selected' : ''}`}
                key={job.id}
                onClick={() => select(job.id)}
              >
                <Icon name="film" size={18} />
                <span>
                  {job.title}
                  <small>{statusLabels[job.status] || job.status}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="library-empty">
              Room for your next idea.
              <br />
              Your films will live here.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="private-note">
            <Icon name="lock" size={14} /> Invite-only workspace
          </span>
          <button type="button" onClick={logout}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <b>{selected ? 'Film production' : 'New film'}</b>
          </div>
          <span className="topbar-right">
            <span className="tiny-dot" /> A little curiosity goes a long way.
            <button
              type="button"
              className="user-avatar"
              onClick={logout}
              aria-label="Sign out of workspace"
              title="Sign out"
            >
              V
            </button>
          </span>
        </header>
        {error && <output className="connection-error">{error}</output>}
        <main>
          {current ? (
            <Film key={current.id} job={current} refresh={() => setRevision((r) => r + 1)} />
          ) : selected ? (
            <div className="empty-details">
              <h2>{jobs.length ? 'This film is not in your workspace.' : 'Loading your film…'}</h2>
              <button type="button" className="secondary" onClick={() => select(null)}>
                Back to the studio
              </button>
            </div>
          ) : (
            <NewFilm
              onCreated={(job) => {
                setJobs((old) => [job, ...old.filter((item) => item.id !== job.id)]);
                select(job.id);
                setRevision((r) => r + 1);
              }}
            />
          )}
        </main>
        <footer>
          MADE TO MAKE SENSE.
          <span>
            Vox Studio <span className="footer-dot">●</span> Private preview
          </span>
        </footer>
      </div>
    </div>
  );
}
