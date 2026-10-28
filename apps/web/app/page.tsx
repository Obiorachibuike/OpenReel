"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Film,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  KeyRound,
  Layers,
  LoaderCircle,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

import {
  api,
  assetUrl,
  type Project,
  type Asset,
  type Scene,
  type Job,
  type Usage,
  type Provider,
} from "../lib/api";
const tabs = [
  { name: "Overview", icon: Grid2X2 },
  { name: "Projects", icon: FolderOpen },
  { name: "Asset library", icon: ImagePlus },
  { name: "AI models", icon: Sparkles },
  { name: "API keys", icon: KeyRound },
  { name: "Usage", icon: AudioLines },
  { name: "Documentation", icon: CircleHelp },
];
export default function Home() {
  const [user, setUser] = useState<{ email: string } | null>(null),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState("Overview"),
    [theme, setTheme] = useState("dark");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState("register");
  const [projects, setProjects] = useState<Project[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [usage, setUsage] = useState<Usage | null>(null);
  const [active, setActive] = useState<Project | null>(null),
    [scenes, setScenes] = useState<Scene[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false),
    [query, setQuery] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]),
    [keys, setKeys] = useState<{ id: string; name: string }[]>([]),
    [newKey, setNewKey] = useState("");
  const refresh = useCallback(async () => {
    const [p, a, j, u] = await Promise.all([
      api<Project[]>("/projects"),
      api<Asset[]>("/assets"),
      api<Job[]>("/jobs"),
      api<Usage>("/usage"),
    ]);
    setProjects(p);
    setAssets(a);
    setJobs(j);
    setUsage(u);
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    api<{ email: string }>("/me")
      .then(async (u) => {
        setUser(u);
        await refresh();
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  async function openProject(p: Project) {
    setActive(p);
    setScenes(await api<Scene[]>(`/projects/${p.id}/scenes`));
    setSelected(null);
    setTab("Editor");
  }
  async function saveProject() {
    if (!active) return;
    setActive(await api<Project>(`/projects/${active.id}`, "PATCH", active));
    setNotice("Project settings saved");
    await refresh();
  }
  async function saveScene(scene: Scene) {
    const saved = await api<Scene>(`/scenes/${scene.id}`, "PATCH", scene);
    setScenes((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    setNotice("Scene saved");
  }
  async function addScene(asset?: Asset) {
    if (!active) return;
    const s = await api<Scene>(`/projects/${active.id}/scenes`, "POST", {
      asset_id: asset?.id ?? null,
      sequence: scenes.length,
      duration: 5,
      narration: "",
    });
    setScenes([...scenes, s]);
    setSelected(s.id);
  }
  const scene = scenes.find((s) => s.id === selected) || scenes[0];
  const previewAsset = assets.find((a) => a.id === scene?.asset_id);
  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  );
  const latestRender = jobs.find(
    (j) =>
      j.project_id === active?.id &&
      j.status === "completed" &&
      j.kind === "render",
  );
  async function upload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      await api("/assets", "POST", form);
    }
    await refresh();
    setNotice("Media uploaded and validated");
  }
  if (!ready)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> Opening your studio…
      </div>
    );
  if (!user)
    return (
      <main className="auth-page">
        <div className="auth-art">
          <Brand />
          <div>
            <div className="eyebrow">YOUR IDEAS. YOUR MODELS. YOUR STUDIO.</div>
            <h1>
              Make something
              <br />
              <em>worth watching.</em>
            </h1>
            <p>
              A little imagination. Your own media.
              <br />
              An open canvas for your next video.
            </p>
            <div className="film-art">
              <span>01 / THE NEXT CHAPTER</span>
              <div className="orb" />
              <div className="art-lines" />
              <span>OPENREEL / CREATIVE SYSTEM</span>
            </div>
          </div>
          <small>Open source. Creator owned.</small>
        </div>
        <section className="auth-form">
          <div className="pill">
            <span className="dot" /> YOUR CREATIVE WORKSPACE
          </div>
          <h2>
            {authMode === "register"
              ? "Start your next chapter."
              : "Welcome back."}
          </h2>
          <p>
            {authMode === "register"
              ? "Create your studio. No paid AI provider required."
              : "Your projects are right where you left them."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void act(async () => {
                setUser(
                  await api(
                    "/auth/" + authMode,
                    "POST",
                    Object.fromEntries(data),
                  ),
                );
                await refresh();
              });
            }}
          >
            <label>
              Email address
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                minLength={10}
                maxLength={128}
                required
                placeholder="At least 10 characters"
                autoComplete={
                  authMode === "register" ? "new-password" : "current-password"
                }
              />
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" />
              ) : authMode === "register" ? (
                "Create your workspace"
              ) : (
                "Sign in"
              )}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {authMode === "register"
              ? "Already have an account?"
              : "New to OpenReel?"}{" "}
            <button
              className="text-button"
              onClick={() =>
                setAuthMode(authMode === "register" ? "login" : "register")
              }
            >
              {authMode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-note">
            <Check size={15} /> Local-first workflow <Check size={15} /> No
            credit card
          </div>
        </section>
      </main>
    );
  return (
    <div className="app-shell">
      <aside>
        <Brand />
        <div className="workspace">
          <div className="workspace-icon">M</div>
          <div>
            My studio<small>Personal workspace</small>
          </div>
          <Settings2 size={15} />
        </div>
        <button className="primary new-video" onClick={() => setCreate(true)}>
          <Plus size={18} /> Create video
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.name}
              className={tab === t.name ? "active" : ""}
              onClick={() => {
                setActive(null);
                setTab(t.name);
                if (t.name === "AI models")
                  void act(async () => setProviders(await api("/providers")));
                if (t.name === "API keys")
                  void act(async () => setKeys(await api("/api-keys")));
              }}
            >
              <t.icon size={18} />
              {t.name}
              {t.name === "Projects" && (
                <span className="count">{projects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="dot" /> LOCAL-FIRST STUDIO
            <p>
              Your media. Your infrastructure.
              <br />
              Your creative control.
            </p>
            <button onClick={() => setTab("Documentation")}>
              Explore the workflow <ArrowUpRight />
            </button>
          </div>
          <div className="account">
            <div className="avatar">{user.email[0].toUpperCase()}</div>
            <div className="account-name">
              My account<small>{user.email}</small>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              onClick={() =>
                void act(async () => {
                  await api("/auth/logout", "POST");
                  setUser(null);
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div>
            Workspace <ChevronRight size={14} />{" "}
            <strong>{tab === "Editor" ? active?.title : tab}</strong>
          </div>
          <div>
            <span className="environment">
              <span className="dot" /> Self-hosted
            </span>
            <button
              title="Toggle theme"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              title="Documentation"
              aria-label="Documentation"
              onClick={() => setTab("Documentation")}
            >
              <CircleHelp size={18} />
            </button>
            <span className="avatar small">{user.email[0].toUpperCase()}</span>
          </div>
        </header>
        <main className="content">
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {(tab === "Overview" || tab === "Projects") && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">LET’S MAKE SOMETHING GREAT</div>
                  <h1>
                    {tab === "Overview"
                      ? "Your creative workspace"
                      : "Your projects"}
                    <span className="green">.</span>
                  </h1>
                  <p>
                    {tab === "Overview"
                      ? "Turn your ideas into videos. Keep every part of the process yours."
                      : "From first frame to final cut. All your stories, in one place."}
                  </p>
                </div>
                <button className="primary" onClick={() => setCreate(true)}>
                  <Plus size={17} /> Create video
                </button>
              </div>
              {tab === "Overview" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="pill">
                        <Sparkles size={13} /> FROM IDEA TO FINAL FRAME
                      </span>
                      <h2>
                        A story only you can tell.
                        <br />
                        <span>Tools to bring it to life.</span>
                      </h2>
                      <p>
                        Start with your own images and clips. Shape your scenes,
                        <br className="desktop" /> add captions, and render
                        something real.
                      </p>
                      <button
                        className="white-button"
                        onClick={() => setCreate(true)}
                      >
                        Create your first cut <ArrowRight size={16} />
                      </button>
                      <small>
                        <span className="dot" /> No paid AI service needed
                      </small>
                    </div>
                    <div className="hero-visual" aria-hidden="true">
                      <div className="visual-label">
                        OPENREEL ORIGINALS <span>01 — ∞</span>
                      </div>
                      <div className="landscape">
                        <div className="sun" />
                        <div className="mountain back" />
                        <div className="mountain front" />
                        <span>
                          Every frame,
                          <br />
                          <i>a new possibility.</i>
                        </span>
                        <div className="frame-corner tl" />
                        <div className="frame-corner br" />
                      </div>
                      <div className="visual-timeline">
                        <span>00:00</span>
                        <div />
                        <div />
                        <div />
                        <div />
                        <span>00:20</span>
                      </div>
                    </div>
                  </section>
                  <section className="stats">
                    <Stat
                      label="Total projects"
                      value={usage?.projects ?? 0}
                      icon={<FolderOpen size={18} />}
                      sub="Stories in your workspace"
                    />
                    <Stat
                      label="Completed renders"
                      value={usage?.completed_renders ?? 0}
                      icon={<Film size={18} />}
                      sub="Ready for the world"
                    />
                    <Stat
                      label="Active jobs"
                      value={activeJobs.length}
                      icon={<Layers size={18} />}
                      sub={
                        activeJobs.length
                          ? "Your worker is processing"
                          : "Queue is clear"
                      }
                    />
                    <Stat
                      label="Storage used"
                      value={`${((usage?.storage_bytes ?? 0) / 1048576).toFixed(1)} MB`}
                      icon={<AudioLines size={18} />}
                      sub="Your uploaded and rendered media"
                    />
                  </section>
                </>
              )}
              <section>
                <div className="section-heading">
                  <h2>
                    {tab === "Overview" ? "Recent projects" : "Project library"}
                    <span className="badge">{projects.length}</span>
                  </h2>
                  <div>
                    {tab === "Overview" ? (
                      <button
                        className="text-button muted"
                        onClick={() => setTab("Projects")}
                      >
                        View all projects <ArrowRight size={15} />
                      </button>
                    ) : (
                      <label className="search">
                        <Search size={16} />
                        <input
                          placeholder="Search projects"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="project-grid">
                  {projects
                    .filter((p) =>
                      p.title.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, tab === "Overview" ? 3 : 100)
                    .map((p, i) => {
                      const j = jobs.find((j) => j.project_id === p.id);
                      return (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => void act(() => openProject(p))}
                        >
                          <div className={"project-thumb tone-" + (i % 3)}>
                            {j?.result_id ? (
                              <video
                                src={assetUrl(j.result_id)}
                                preload="metadata"
                              />
                            ) : (
                              <>
                                <Clapperboard size={34} />
                                <span>{p.ratio}</span>
                              </>
                            )}
                            <div className="thumb-status">
                              {j?.status ?? "Draft"}
                            </div>
                          </div>
                          <div className="project-description">
                            <h3>
                              {p.title}
                              <MoreHorizontal size={18} />
                            </h3>
                            <p>
                              {new Date(p.created).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}{" "}
                              <span>•</span> {p.ratio} video
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  <button
                    className="new-project-card"
                    onClick={() => setCreate(true)}
                  >
                    <span>
                      <Plus size={23} />
                    </span>
                    <h3>
                      {projects.length
                        ? "Start a new story"
                        : "Your first story starts here"}
                    </h3>
                    <p>Bring your media. Make it yours.</p>
                  </button>
                </div>
              </section>
              {tab === "Overview" && (
                <section className="bottom-grid">
                  <div className="panel">
                    <div className="section-heading">
                      <h2>Render activity</h2>
                      <span className="live">
                        <span className="dot" /> LIVE QUEUE
                      </span>
                    </div>
                    {jobs.length ? (
                      jobs
                        .filter((j) => j.kind === "render")
                        .slice(0, 4)
                        .map((j) => (
                          <JobRow
                            key={j.id}
                            job={j}
                            projects={projects}
                            action={(verb) =>
                              void act(async () => {
                                await api(`/jobs/${j.id}/${verb}`, "POST");
                                await refresh();
                              })
                            }
                          />
                        ))
                    ) : (
                      <div className="empty-inline">
                        <div className="icon-box">
                          <Layers size={22} />
                        </div>
                        <h3>A clear queue. A fresh start.</h3>
                        <p>
                          Your render progress will appear here.
                          <br />
                          Create a project and export your first video.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="panel workflow">
                    <div className="section-heading">
                      <h2>A simpler way to create</h2>
                      <span className="badge">QUICK START</span>
                    </div>
                    {[
                      [
                        "01",
                        "Bring your own media",
                        "Upload images, video clips, and audio.",
                      ],
                      [
                        "02",
                        "Build your story",
                        "Arrange scenes and give every frame a voice.",
                      ],
                      [
                        "03",
                        "Make the final cut",
                        "Add captions and render a real MP4.",
                      ],
                    ].map(([n, t, d]) => (
                      <div className="step" key={n}>
                        <span>{n}</span>
                        <div>
                          <h3>{t}</h3>
                          <p>{d}</p>
                        </div>
                      </div>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => setTab("Documentation")}
                    >
                      Read the creator guide <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          {tab === "Asset library" && (
            <>
              <Title
                title="Your media, organized."
                description="Original images, clips, audio, and finished renders. Ready for your next story."
              />
              <UploadControl
                upload={(f) => void act(() => upload(f))}
                busy={busy}
              />
              <div className="asset-grid">
                {assets.map((a) => (
                  <div className="asset-card" key={a.id}>
                    {a.kind === "image" ? (
                      <img alt={a.name} src={assetUrl(a.id)} />
                    ) : a.kind === "video" ? (
                      <video controls src={assetUrl(a.id)} />
                    ) : (
                      <div className="audio-preview">
                        <AudioLines />
                        <audio controls src={assetUrl(a.id)} />
                      </div>
                    )}
                    <h3>{a.name}</h3>
                    <p>
                      {a.kind} · {(a.size / 1048576).toFixed(2)} MB{" "}
                      <a
                        href={assetUrl(a.id)}
                        download
                        aria-label={`Download ${a.name}`}
                      >
                        <ArrowDownToLine size={16} />
                      </a>
                    </p>
                  </div>
                ))}
              </div>
              {!assets.length && (
                <Empty
                  title="Room for your raw material."
                  text="Upload your first image, clip, or audio file. Files are inspected before they join your library."
                />
              )}
            </>
          )}
          {tab === "Editor" && active && (
            <>
              <div className="editor-heading">
                <button
                  className="text-button muted"
                  onClick={() => {
                    setTab("Projects");
                    setActive(null);
                  }}
                >
                  <ArrowLeft size={17} /> Projects
                </button>
                <div>
                  <a
                    className="secondary"
                    href={`/api/v1/projects/${active.id}/export`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Storyboard JSON
                  </a>
                  <button
                    className="danger-icon"
                    aria-label="Delete project"
                    onClick={() => {
                      if (
                        confirm(
                          "Delete project, scenes, and job history? Media stays in your library.",
                        )
                      )
                        void act(async () => {
                          await api(`/projects/${active.id}`, "DELETE");
                          setActive(null);
                          setTab("Projects");
                          await refresh();
                        });
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void act(saveProject)}
                  >
                    <Check size={16} /> Save settings
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await saveProject();
                        await api(`/projects/${active.id}/render`, "POST");
                        await refresh();
                        setNotice(
                          "Render queued. Keep the worker running; progress appears below.",
                        );
                      })
                    }
                  >
                    <Film size={17} /> Render MP4
                  </button>
                </div>
              </div>
              <div className="editor-grid">
                <section className="panel preview-panel">
                  <div className="section-heading">
                    <h2>Scene preview</h2>
                    <span className="badge">{active.ratio} · 720p output</span>
                  </div>
                  <div
                    className="preview"
                    style={{ aspectRatio: active.ratio.replace(":", "/") }}
                  >
                    {previewAsset?.kind === "image" ? (
                      <img
                        src={assetUrl(previewAsset.id)}
                        alt={previewAsset.name}
                      />
                    ) : previewAsset?.kind === "video" ? (
                      <video src={assetUrl(previewAsset.id)} controls />
                    ) : (
                      <div className="empty-inline">
                        <Film />
                        <p>Select media for this scene</p>
                      </div>
                    )}
                    <span className="caption-preview">{scene?.narration}</span>
                  </div>
                  <p className="hint">
                    Scene-based preview. Caption timing is segment-level. Source
                    clip audio is muted in the final render.
                  </p>
                  {latestRender?.result_id && (
                    <div className="render-preview">
                      <h3>Latest finished render</h3>
                      <video controls src={assetUrl(latestRender.result_id)} />
                      <a
                        className="text-button"
                        href={assetUrl(latestRender.result_id)}
                        download
                      >
                        <ArrowDownToLine size={16} /> Download MP4
                      </a>
                    </div>
                  )}
                </section>
                <section className="panel inspector">
                  <h2>Project settings</h2>
                  <label>
                    Title
                    <input
                      value={active.title}
                      maxLength={200}
                      onChange={(e) =>
                        setActive({ ...active, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Aspect ratio
                    <select
                      value={active.ratio}
                      onChange={(e) =>
                        setActive({ ...active, ratio: e.target.value })
                      }
                    >
                      <option>9:16</option>
                      <option>16:9</option>
                      <option>1:1</option>
                    </select>
                  </label>
                  <label>
                    Background audio
                    <select
                      value={active.music_id ?? ""}
                      onChange={(e) =>
                        setActive({
                          ...active,
                          music_id: e.target.value || null,
                        })
                      }
                    >
                      <option value="">No background audio</option>
                      {assets
                        .filter((a) => a.kind === "audio")
                        .map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Music volume · {Math.round(active.music_volume * 100)}%
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={active.music_volume}
                      onChange={(e) =>
                        setActive({
                          ...active,
                          music_volume: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Script / supplied narration
                    <textarea
                      value={active.script}
                      rows={4}
                      maxLength={50000}
                      onChange={(e) =>
                        setActive({ ...active, script: e.target.value })
                      }
                      placeholder="Keep your source narration here. Text is not synthesized automatically."
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      void act(async () => {
                        if (
                          active.script
                            .split(/\n\s*\n/)
                            .some((p) => p.length > 2000)
                        )
                          throw new Error(
                            "Split script paragraphs longer than 2,000 characters before creating scenes.",
                          );
                        for (const [index, text] of active.script
                          .split(/\n\s*\n/)
                          .filter(Boolean)
                          .entries()) {
                          await api(`/projects/${active.id}/scenes`, "POST", {
                            sequence: scenes.length + index,
                            narration: text,
                            duration: 5,
                          });
                        }
                        setScenes(await api(`/projects/${active.id}/scenes`));
                      })
                    }
                    disabled={busy || !active.script.trim()}
                  >
                    <WandSparkles size={15} /> Add scenes from paragraphs
                  </button>
                  <p className="hint">
                    Adds one 5-second scene per paragraph, preserving the
                    supplied words. Choose media before rendering.
                  </p>
                </section>
              </div>
              <section className="panel timeline-panel">
                <div className="section-heading">
                  <h2>
                    Storyboard{" "}
                    <span className="badge">
                      {scenes.length} scenes ·{" "}
                      {scenes.reduce((n, s) => n + s.duration, 0)}s
                    </span>
                  </h2>
                  <button
                    className="secondary"
                    onClick={() => void act(() => addScene())}
                    disabled={busy}
                  >
                    <Plus size={15} /> Add scene
                  </button>
                </div>
                <div className="timeline">
                  {scenes.map((s, i) => {
                    const a = assets.find((a) => a.id === s.asset_id);
                    return (
                      <button
                        className={
                          "scene-tile " + (scene?.id === s.id ? "selected" : "")
                        }
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {a?.kind === "image" ? (
                          <img src={assetUrl(a.id)} alt="" />
                        ) : (
                          <Film size={25} />
                        )}
                        <small>{s.duration}s</small>
                      </button>
                    );
                  })}
                </div>
                {scene && (
                  <div className="scene-controls">
                    <label>
                      Scene media
                      <select
                        value={scene.asset_id ?? ""}
                        onChange={(e) =>
                          setScenes(
                            scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, asset_id: e.target.value || null }
                                : s,
                            ),
                          )
                        }
                      >
                        <option value="">Choose an asset</option>
                        {assets
                          .filter((a) => a.kind !== "audio")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Duration (seconds)
                      <input
                        type="number"
                        min="0.5"
                        max="60"
                        step="0.5"
                        value={scene.duration}
                        onChange={(e) =>
                          setScenes(
                            scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, duration: Number(e.target.value) }
                                : s,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Order
                      <input
                        type="number"
                        min="0"
                        value={scene.sequence}
                        onChange={(e) =>
                          setScenes(
                            scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, sequence: Number(e.target.value) }
                                : s,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="caption-input">
                      Caption text
                      <textarea
                        maxLength={2000}
                        value={scene.narration}
                        onChange={(e) =>
                          setScenes(
                            scenes.map((s) =>
                              s.id === scene.id
                                ? { ...s, narration: e.target.value }
                                : s,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await saveScene(scene);
                          setScenes(await api(`/projects/${active.id}/scenes`));
                        })
                      }
                    >
                      Save scene
                    </button>
                    <button
                      className="danger-icon"
                      aria-label="Delete scene"
                      onClick={() => {
                        if (confirm("Delete this scene?"))
                          void act(async () => {
                            await api(`/scenes/${scene.id}`, "DELETE");
                            setScenes(scenes.filter((s) => s.id !== scene.id));
                          });
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
                <UploadControl
                  upload={(f) => void act(() => upload(f))}
                  busy={busy}
                />
              </section>
              <section className="panel">
                <h2>Project renders</h2>
                {jobs
                  .filter(
                    (j) => j.project_id === active.id && j.kind === "render",
                  )
                  .map((j) => (
                    <JobRow
                      key={j.id}
                      job={j}
                      projects={projects}
                      action={(verb) =>
                        void act(async () => {
                          await api(`/jobs/${j.id}/${verb}`, "POST");
                          await refresh();
                        })
                      }
                    />
                  ))}
              </section>
            </>
          )}
          {tab === "AI models" && (
            <>
              <Title
                title="Your models. Your choice."
                description="Connect infrastructure you control. Availability is never simulated."
              />
              <div className="provider-grid">
                {providers.map((p) => (
                  <section className="panel" key={p.id}>
                    <div className="section-heading">
                      <h2>
                        {p.id === "ffmpeg"
                          ? "FFmpeg media engine"
                          : "Ollama · text generation"}
                      </h2>
                      <span className="badge">
                        {p.configured ? "Configured" : "Not configured"}
                      </span>
                    </div>
                    <p>{p.note}</p>
                    <code>
                      {p.model ??
                        (p.id === "ollama"
                          ? "OLLAMA_URL + OLLAMA_MODEL"
                          : "Uploaded images and clips → MP4")}
                    </code>
                  </section>
                ))}
              </div>
              <section className="panel script-tool">
                <h2>Draft a narration</h2>
                <p>
                  Requires a configured Ollama server and installed model.
                  Review generated claims before use.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void act(async () => {
                      const projectId = String(d.get("project_id"));
                      await api(
                        "/scripts/generate?project_id=" +
                          encodeURIComponent(projectId),
                        "POST",
                        { topic: d.get("topic") },
                      );
                      await refresh();
                      setNotice(
                        "Script job queued. The worker will return a draft below.",
                      );
                    });
                  }}
                >
                  <label>
                    Save draft for project
                    <select required name="project_id">
                      <option value="">Choose a project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    name="topic"
                    minLength={3}
                    maxLength={4000}
                    required
                    placeholder="What story would you like to tell?"
                  />
                  <button disabled={busy} className="primary">
                    <Sparkles size={16} />
                    {busy ? "Requesting model…" : "Generate draft"}
                  </button>
                </form>
                {jobs
                  .filter((j) => j.kind === "script")
                  .map((j) => (
                    <section className="panel" key={j.id}>
                      <JobRow
                        job={j}
                        projects={projects}
                        action={(verb) =>
                          void act(async () => {
                            await api(`/jobs/${j.id}/${verb}`, "POST");
                            await refresh();
                          })
                        }
                      />
                      {j.output?.script && (
                        <>
                          <textarea
                            aria-label="Generated draft"
                            readOnly
                            rows={9}
                            value={j.output.script}
                          />
                          <p className="hint">
                            Review factual claims. Copy into the project script
                            when approved.
                          </p>
                        </>
                      )}
                    </section>
                  ))}
              </section>
            </>
          )}
          {tab === "API keys" && (
            <>
              <Title
                title="Build beyond the studio."
                description="Use the REST API, SDKs, or MCP with your own revocable credentials."
              />
              <section className="panel">
                <h2>Create an API key</h2>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void act(async () => {
                      const r = await api<{ key: string }>(
                        "/api-keys",
                        "POST",
                        { name: d.get("name") },
                      );
                      setNewKey(r.key);
                      setKeys(await api("/api-keys"));
                    });
                  }}
                >
                  <input
                    name="name"
                    placeholder="Key name, e.g. local automation"
                    required
                    maxLength={100}
                  />
                  <button className="primary" disabled={busy}>
                    <Plus size={16} /> Create key
                  </button>
                </form>
                {newKey && (
                  <div className="notice">
                    Copy this key now; it will not be shown again.
                    <code>{newKey}</code>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(newKey);
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
                {keys.map((k) => (
                  <div className="key-row" key={k.id}>
                    <KeyRound size={18} />
                    {k.name}
                    <button
                      className="text-button"
                      onClick={() => {
                        if (confirm("Revoke this API key?"))
                          void act(async () => {
                            await api(`/api-keys/${k.id}`, "DELETE");
                            setKeys(keys.filter((x) => x.id !== k.id));
                          });
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {tab === "Usage" && (
            <>
              <Title
                title="Nothing hidden in the numbers."
                description="Actual workspace records. Local compute costs are unknown until configured."
              />
              <section className="stats">
                <Stat
                  label="Projects"
                  value={usage?.projects ?? 0}
                  sub="Database-backed"
                  icon={<FolderOpen />}
                />
                <Stat
                  label="Completed renders"
                  value={usage?.completed_renders ?? 0}
                  sub="Validated outputs"
                  icon={<Film />}
                />
                <Stat
                  label="Storage"
                  value={`${((usage?.storage_bytes ?? 0) / 1048576).toFixed(1)} MB`}
                  sub="Originals and outputs"
                  icon={<Layers />}
                />
                <Stat
                  label="Compute cost"
                  value="Unknown"
                  sub="Not estimated as free"
                  icon={<AudioLines />}
                />
              </section>
              <section className="panel">
                <h2>Development limits</h2>
                <p>
                  100 MB per upload by default · 3 active render jobs per
                  workspace · 100 scenes per render · 20-minute maximum timeline
                  · 3 worker attempts.
                </p>
                <p>
                  No paid media providers, billing, or credits are enabled in
                  this release.
                </p>
              </section>
            </>
          )}
          {tab === "Documentation" && (
            <>
              <Title
                title="From raw material to real video."
                description="A practical, local-first workflow. No simulated generation, no hidden dependencies."
              />
              <div className="docs-grid">
                {[
                  [
                    "1. Create your project",
                    "Choose a title and aspect ratio. Projects and scripts are saved in your workspace.",
                  ],
                  [
                    "2. Upload your media",
                    "Use Asset library to upload images, videos, and background audio. FFprobe inspects every upload.",
                  ],
                  [
                    "3. Shape the storyboard",
                    "Add scenes, select media, set durations and captions. Save each scene explicitly. Order controls determine render order.",
                  ],
                  [
                    "4. Render and review",
                    "Save project settings and queue an MP4 render. A dedicated worker runs FFmpeg and validates the output. Watch or download the finished video.",
                  ],
                  [
                    "Connect a local text model",
                    "Set OLLAMA_URL and OLLAMA_MODEL on the backend. Install the model yourself, check its license, then use AI models to request a narration draft.",
                  ],
                  [
                    "What’s not in this release",
                    "Generative images/video, TTS, transcription, social publishing, scheduling, payments, and advanced multitrack editing are not implemented. No controls pretend otherwise.",
                  ],
                ].map(([t, d]) => (
                  <section className="panel" key={t}>
                    <h2>{t}</h2>
                    <p>{d}</p>
                  </section>
                ))}
              </div>
              <section className="panel">
                <h2>Developer API</h2>
                <p>
                  All API routes use /api/v1. Pass Authorization: Bearer
                  YOUR_KEY for server-side integrations. Never embed private
                  keys in browser code.
                </p>
                <pre>
                  {
                    'curl -H "Authorization: Bearer $OPENREEL_API_KEY" \\\n  http://localhost:8000/api/v1/projects'
                  }
                </pre>
                <p>
                  See the repository README and docs for deployment, SDK, and
                  MCP commands.
                </p>
              </section>
            </>
          )}
          <footer>
            <span>
              <span className="logo-mini">◒</span> OpenReel AI{" "}
              <span className="footer-divider">/</span> Made for the way you
              create.
            </span>
            <span>Open source. Endless possibility.</span>
          </footer>
        </main>
      </div>
      {create && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setCreate(false)}
            >
              <X size={20} />
            </button>
            <div className="icon-box">
              <Clapperboard size={24} />
            </div>
            <h2 id="create-title">Every story starts somewhere.</h2>
            <p>
              Create a blank canvas. Bring your own images, clips, and audio.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void act(async () => {
                  const p = await api<Project>("/projects", "POST", {
                    title: d.get("title"),
                    ratio: d.get("ratio"),
                    script: d.get("script"),
                  });
                  setCreate(false);
                  await refresh();
                  await openProject(p);
                });
              }}
            >
              <label>
                Project title
                <input
                  autoFocus
                  name="title"
                  placeholder="Give your next story a name"
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Format
                <select name="ratio">
                  <option value="9:16">Vertical · 9:16</option>
                  <option value="16:9">Landscape · 16:9</option>
                  <option value="1:1">Square · 1:1</option>
                </select>
              </label>
              <label>
                Script (optional)
                <textarea
                  name="script"
                  rows={3}
                  placeholder="Your narration, in your words"
                  maxLength={50000}
                />
              </label>
              <button className="primary" disabled={busy}>
                Create project <ArrowRight size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function ArrowUpRight() {
  return <ArrowRight size={13} style={{ transform: "rotate(-35deg)" }} />;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Clapperboard size={23} />
      </span>
      openreel<span className="brand-ai">AI</span>
    </div>
  );
}
function Title({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">OPENREEL WORKSPACE</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{sub}</p>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-inline panel">
      <ImagePlus size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function UploadControl({
  upload,
  busy,
}: {
  upload: (files: FileList | null) => void;
  busy: boolean;
}) {
  return (
    <label className="upload-control">
      <Upload size={19} />
      <span>
        {busy ? "Processing…" : "Upload media"}
        <small>Images, video, or audio · 100 MB per file by default</small>
      </span>
      <input
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        disabled={busy}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
function JobRow({
  job,
  projects,
  action,
}: {
  job: Job;
  projects: Project[];
  action: (verb: string) => void;
}) {
  return (
    <div className="job-row">
      <div className="icon-box">
        <Film size={17} />
      </div>
      <div className="job-description">
        <h3>
          {projects.find((p) => p.id === job.project_id)?.title ?? "Render"}
        </h3>
        <p>{job.error ?? job.stage}</p>
        {job.status === "running" && (
          <progress value={job.progress} max="100" />
        )}
      </div>
      <span className={"job-status " + job.status}>{job.status}</span>
      {job.result_id ? (
        <a href={assetUrl(job.result_id)} download aria-label="Download render">
          <ArrowDownToLine size={17} />
        </a>
      ) : job.status === "failed" || job.status === "cancelled" ? (
        <button className="text-button" onClick={() => action("retry")}>
          Retry
        </button>
      ) : (
        <button
          title="Cancel job"
          aria-label="Cancel job"
          onClick={() => action("cancel")}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
