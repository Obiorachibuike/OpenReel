export type Project = {
  id: string;
  title: string;
  script: string;
  ratio: "9:16" | "16:9" | "1:1";
  version: number;
};
export type Job = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  error: string | null;
  result_id: string | null;
};
export type SceneInput = {
  asset_id?: string;
  sequence?: number;
  duration?: number;
  narration?: string;
};
export class OpenReelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenReelError";
  }
}
/** Server-side client. Never ship private API keys to a browser. */
export class OpenReelClient {
  private base: string;
  constructor(
    private config: { apiKey: string; baseUrl?: string; timeoutMs?: number },
  ) {
    this.base =
      (config.baseUrl ?? "http://localhost:8000").replace(/\/$/, "") +
      "/api/v1";
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
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
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new OpenReelError(
        res.status,
        data?.error?.message ?? res.statusText,
      );
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }
  projects = {
    list: () => this.request<Project[]>("/projects"),
    create: (data: {
      title: string;
      script?: string;
      ratio?: Project["ratio"];
    }) => this.request<Project>("/projects", "POST", data),
    get: (id: string) =>
      this.request<Project>(`/projects/${encodeURIComponent(id)}`),
  };
  scenes = {
    list: (projectId: string) =>
      this.request(`/projects/${encodeURIComponent(projectId)}/scenes`),
    create: (projectId: string, data: SceneInput) =>
      this.request(
        `/projects/${encodeURIComponent(projectId)}/scenes`,
        "POST",
        data,
      ),
    update: (id: string, data: SceneInput & { version: number }) =>
      this.request(`/scenes/${encodeURIComponent(id)}`, "PATCH", data),
  };
  renders = {
    create: (projectId: string) =>
      this.request<Job>(
        `/projects/${encodeURIComponent(projectId)}/render`,
        "POST",
      ),
  };
  jobs = {
    get: (id: string) => this.request<Job>(`/jobs/${encodeURIComponent(id)}`),
    cancel: (id: string) =>
      this.request<Job>(`/jobs/${encodeURIComponent(id)}/cancel`, "POST"),
    retry: (id: string) =>
      this.request<Job>(`/jobs/${encodeURIComponent(id)}/retry`, "POST"),
    waitForCompletion: async (
      id: string,
      { timeoutMs = 900000, intervalMs = 2000 } = {},
    ) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const job = await this.jobs.get(id);
        if (job.status === "completed") return job;
        if (["failed", "cancelled"].includes(job.status))
          throw new OpenReelError(409, job.error ?? job.status);
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      throw new OpenReelError(408, "Polling deadline exceeded");
    },
  };
  assets = {
    upload: (file: Blob, name: string) => {
      const form = new FormData();
      form.set("file", file, name);
      return this.request<{ id: string }>("/assets", "POST", form);
    },
    download: async (id: string) => {
      const res = await fetch(
        `${this.base}/assets/${encodeURIComponent(id)}/download`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 30000),
        },
      );
      if (!res.ok) throw new OpenReelError(res.status, "Download failed");
      return res.blob();
    },
  };
  usage = () => this.request("/usage");
  providers = () => this.request("/providers");
}
