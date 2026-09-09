export interface ProductionLimits {
  maxCalls: number | null;
  maxSearches: number | null;
  maxImages: number | null;
  maxTakes: number | null;
  maxImageCorrections: number | null;
  maxEditorialCorrections: number | null;
  maxFilmCorrections: number | null;
  maxTechnicalRepairs: number | null;
}

export interface Job {
  limits: ProductionLimits;
  usage: { [K in keyof ProductionLimits]: number };
  stopRequested?: boolean;
  blockReason?: string | null;
  remaining: ProductionLimits;
  continuation: {
    checkpointSha256: string;
    targets: string[];
    refusal: string;
    pending: boolean;
    requiredLimits: Record<string, ProductionLimits>;
  };
  progress: {
    researchReady: boolean;
    narrationReady: boolean;
    planReady: boolean;
    imagesReady: number;
    imagesCreated: number;
    imagesRequired?: number | null;
    imagesComplete?: boolean;
    renderReady: boolean;
    reviewReady: boolean;
    deliveryReady?: boolean;
  };
  corrections: {
    id: string;
    target: string;
    instruction: string;
    identity: string | null;
    outcome?: string;
  }[];
  filmObservations: {
    problem: string;
    expected: string;
    affectedIds: string[];
    startSeconds: number;
    endSeconds: number;
  }[];
  id: string;
  prompt: string;
  title: string;
  duration: number;
  language: string;
  status: string;
  createdAt: number;
  recorded: boolean;
  message: string;
  runId: string | null;
  savedAt?: string | null;
  progressConnectionLost?: boolean;
  renderProgress?: {
    phase: string;
    elapsedMs: number;
    observedAt: string;
    totalFrames?: number;
    renderedFrames?: number;
    encodedFrames?: number;
    concurrency?: number;
  } | null;
  imageProgress?: { identity: string; phase: string; status: string; observedAt: string | null }[];
  events: {
    sequence: number;
    phase: string;
    status: string;
    summary: string;
    observedAt?: string | null;
    imageIdentity?: string | null;
  }[];
  sources: { title: string; url: string }[];
  beats: { id: string; text: string }[];
  images: {
    identity: string;
    sha256: string;
    url: string;
    accepted: boolean;
    reviewPending?: boolean;
    assessment: string;
    observations: { problem: string; expected: string; affectedIds: string[] }[];
    meaning: string;
    requiredLimits: ProductionLimits;
  }[];
  awaitingImage: { sha256: string; url: string; meaning: string } | null;
  preview: { url: string; sha256: string; reviewed: boolean; ready?: boolean } | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Vox-Studio': '1', ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof data.detail === 'string' ? data.detail : 'The request could not be completed.',
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export const statusLabels: Record<string, string> = {
  awaiting_authorization: 'Ready to start',
  queued: 'Ready to start',
  running: 'In production',
  awaiting_image: 'Your review needed',
  reviewed: 'Film ready',
  ready: 'Film ready',
  blocked: 'Needs attention',
  interrupted: 'Recovery needed',
  failed: 'Production stopped',
  declined: 'Brief declined',
};
