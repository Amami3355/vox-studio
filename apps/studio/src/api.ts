export interface Job {
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
  events: { sequence: number; phase: string; status: string; summary: string }[];
  sources: { title: string; url: string }[];
  beats: { id: string; text: string }[];
  images: {
    identity: string;
    sha256: string;
    url: string;
    accepted: boolean;
    assessment: string;
    meaning: string;
  }[];
  awaitingImage: { sha256: string; url: string; meaning: string } | null;
  preview: { url: string; sha256: string; reviewed: boolean } | null;
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
  awaiting_authorization: 'Budget approval needed',
  queued: 'Ready to start',
  running: 'In production',
  awaiting_image: 'Your review needed',
  reviewed: 'Film ready',
  blocked: 'Needs attention',
  interrupted: 'Recovery needed',
  failed: 'Production stopped',
  declined: 'Brief declined',
};
