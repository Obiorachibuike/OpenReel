export type Project = {
  id: string;
  title: string;
  script: string;
  ratio: string;
  version: number;
  music_id: string | null;
  music_volume: number;
  created: string;
};
export type Asset = { id: string; name: string; kind: string; size: number };
export type Scene = {
  id: string;
  project_id: string;
  version: number;
  asset_id: string | null;
  duration: number;
  narration: string;
  sequence: number;
};
export type Job = {
  id: string;
  project_id: string;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  result_id: string | null;
  kind: string;
  output: { script: string } | null;
};
export type Usage = {
  storage_bytes: number;
  projects: number;
  completed_renders: number;
  cost_note: string;
};
export type Provider = {
  id: string;
  configured: boolean;
  model: string | null;
  note: string;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api/v1" + path, {
    method,
    headers: {
      "X-OpenReel-Client": "1",
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const assetUrl = (id: string) => `/api/v1/assets/${id}/download`;
