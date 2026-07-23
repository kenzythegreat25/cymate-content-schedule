"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ContentItem,
  PLATFORMS,
  PLATFORM_META,
  PLATFORM_LIMITS,
  STATUSES,
  STATUS_META,
  CONTENT_TYPES,
  CONTENT_TYPE_META,
  REVIEW_STATUS_META,
  Platform,
  Status,
  ContentType,
  ReviewStatus,
  emptyItem,
} from "../../lib/types";
import {
  basenameFromUrl,
  createPost,
  deletePost,
  downloadUrl,
  ensureShareToken,
  isVideoUrl,
  listPosts,
  removeMedia,
  updatePost,
  uploadMedia,
} from "../../lib/storage";
import { supabaseBrowser } from "../../lib/supabase/client";
import { useTheme, type Theme } from "../../lib/theme";

type View = "board" | "calendar" | "list" | "tasks";

const SYNCED_STATUSES = new Set(["Review", "Scheduled", "Posted"]);

/* ─── Task types (localStorage-only, never touches content DB) ─── */
type TaskCategory = "Cold Email" | "Content" | "Client" | "Admin" | "Other";
const TASK_CATEGORIES: TaskCategory[] = ["Cold Email", "Content", "Client", "Admin", "Other"];
const TASK_CAT_META: Record<TaskCategory, { dot: string; bg: string; text: string; ring: string }> = {
  "Cold Email": { dot: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/40",   text: "text-blue-700 dark:text-blue-300",   ring: "ring-blue-200 dark:ring-blue-800" },
  "Content":    { dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-200 dark:ring-violet-800" },
  "Client":     { dot: "bg-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-950/40",text: "text-emerald-700 dark:text-emerald-300",ring: "ring-emerald-200 dark:ring-emerald-800" },
  "Admin":      { dot: "bg-slate-400",  bg: "bg-slate-50 dark:bg-slate-800/40",  text: "text-slate-600 dark:text-slate-300",  ring: "ring-slate-200 dark:ring-slate-700" },
  "Other":      { dot: "bg-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/40",  text: "text-amber-700 dark:text-amber-300",  ring: "ring-amber-200 dark:ring-amber-800" },
};
type Task = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  deadline: string; // YYYY-MM-DD or ""
  done: boolean;
  createdAt: string;
};
const TASKS_KEY = "cymate-tasks-v1";
function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) ?? "[]"); } catch { return []; }
}
function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function isOverdue(t: Task) { return !t.done && !!t.deadline && t.deadline < todayStr(); }

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("board");
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  const pendingPatches = useRef<Record<string, Partial<ContentItem>>>({});
  const flushTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserEmail(userData.user?.email ?? "");
      const meta = (userData.user?.user_metadata ?? {}) as Record<string, string>;
      const fullName = meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ");
      setUserName(fullName || (userData.user?.email ?? ""));
      const rows = await listPosts();
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-sync all Review/Scheduled/Posted items to Airtable on every page load.
  // Safe to run unconditionally because the API uses upsert — no duplicates.
  useEffect(() => {
    if (loading || userEmail !== "kenc@cymate.io") return;
    const toSync = items.filter((i) => SYNCED_STATUSES.has(i.status));
    if (!toSync.length) return;
    fetch("/api/sync-airtable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posts: toSync }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userEmail]);

  const flush = (id: string) => {
    const patch = pendingPatches.current[id];
    if (!patch) return;
    delete pendingPatches.current[id];
    updatePost(id, patch);
  };

  const scheduleFlush = (id: string, patch: Partial<ContentItem>) => {
    pendingPatches.current[id] = { ...(pendingPatches.current[id] ?? {}), ...patch };
    clearTimeout(flushTimers.current[id]);
    flushTimers.current[id] = setTimeout(() => flush(id), 500);
  };

  useEffect(() => {
    const flushAll = () => Object.keys(pendingPatches.current).forEach(flush);
    window.addEventListener("beforeunload", flushAll);
    return () => {
      flushAll();
      window.removeEventListener("beforeunload", flushAll);
    };
  }, []);

  const signOut = async () => {
    Object.keys(pendingPatches.current).forEach(flush);
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (platformFilter && !i.platforms.includes(platformFilter)) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.onScreenText.toLowerCase().includes(q) ||
        i.notes.toLowerCase().includes(q)
      );
    });
  }, [items, query, platformFilter]);

  const editing = items.find((i) => i.id === editingId) ?? null;

  const addRow = async (preset?: Partial<ContentItem>) => {
    const created = await createPost({ ...emptyItem(), ...preset });
    if (!created) return;
    setItems((prev) => [...prev, created]);
    setEditingId(created.id);
  };

  const updateRow = (id: string, patch: Partial<ContentItem>) => {
    const prevItem = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

    const isAdmin = userEmail === "kenc@cymate.io";

    // Moving away from a synced status → delete from Airtable instantly
    if (isAdmin && patch.status && !SYNCED_STATUSES.has(patch.status) && prevItem && SYNCED_STATUSES.has(prevItem.status)) {
      const map: Record<string, string> = JSON.parse(localStorage.getItem("airtable_id_map") ?? "{}");
      const airtableId = map[id];
      if (airtableId) {
        fetch("/api/sync-airtable", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ airtableId }),
        }).then(() => {
          delete map[id];
          localStorage.setItem("airtable_id_map", JSON.stringify(map));
          const synced: string[] = JSON.parse(localStorage.getItem("airtable_synced_ids") ?? "[]");
          localStorage.setItem("airtable_synced_ids", JSON.stringify(synced.filter((s) => s !== id)));
        });
      }
      scheduleFlush(id, patch);
      return;
    }

    if (isAdmin && patch.status && SYNCED_STATUSES.has(patch.status)) {
      const merged = { ...(pendingPatches.current[id] ?? {}), ...patch };
      delete pendingPatches.current[id];
      clearTimeout(flushTimers.current[id]);
      const currentItem = { ...items.find((i) => i.id === id)!, ...merged };
      updatePost(id, merged);
      const syncedIds: string[] = JSON.parse(localStorage.getItem("airtable_synced_ids") ?? "[]");
      const idMap: Record<string, string> = JSON.parse(localStorage.getItem("airtable_id_map") ?? "{}");
      const existingAirtableId = idMap[id];

      if (existingAirtableId) {
        // Already in Airtable — just update the status field
        fetch("/api/sync-airtable", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ airtableId: existingAirtableId, status: patch.status }),
        });
      } else {
        // Not yet in Airtable — create new record
        fetch("/api/sync-airtable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posts: [currentItem] }),
        }).then((r) => r.json()).then((result) => {
          if (result.newlySyncedIds?.length) {
            const updated = Array.from(new Set([...syncedIds, ...result.newlySyncedIds]));
            localStorage.setItem("airtable_synced_ids", JSON.stringify(updated));
          }
          if (result.airtableIdMap) {
            localStorage.setItem("airtable_id_map", JSON.stringify({ ...idMap, ...result.airtableIdMap }));
          }
        });
      }
    } else {
      scheduleFlush(id, patch);
    }
  };

  const deleteRow = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
    delete pendingPatches.current[id];
    clearTimeout(flushTimers.current[id]);
    await deletePost(id);
  };

  const bulkDeleteRows = async (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    if (editingId && ids.includes(editingId)) setEditingId(null);
    ids.forEach((id) => {
      delete pendingPatches.current[id];
      clearTimeout(flushTimers.current[id]);
    });
    await Promise.all(ids.map((id) => deletePost(id)));
  };

  const seed = async () => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const offset = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
    const samples: Partial<ContentItem>[] = [
      { title: "Q3 product reveal teaser", date: offset(1), description: "60-sec cinematic cut. Hook in first 2s.", platforms: ["LinkedIn", "Instagram", "Youtube"], status: "Scheduled", onScreenText: "Built for builders." },
      { title: "Founder Q&A — bootstrap edition", date: offset(4), description: "Carousel of 8 slides. Pose question on slide 1.", platforms: ["LinkedIn", "Instagram"], status: "Drafting" },
      { title: "Customer story: Aviary Labs", date: offset(-3), description: "How they shipped 3x faster with our platform.", platforms: ["LinkedIn", "Youtube"], status: "Posted", performanceScore: "12.4k views" },
      { title: "Behind the build: design system", date: offset(7), description: "Process video. Time-lapse of Figma + Linear screens.", platforms: ["Youtube", "TikTok"], status: "Idea" },
      { title: "Hot take: meeting culture", date: offset(2), description: "Hook: most teams confuse motion with progress.", platforms: ["X", "LinkedIn"], status: "Idea" },
    ];
    const created = await Promise.all(samples.map((s) => createPost({ ...emptyItem(), ...s })));
    setItems((prev) => [...prev, ...created.filter((c): c is ContentItem => !!c)]);
  };

  const stats = useMemo(() => {
    const total = items.length;
    const scheduled = items.filter((i) => i.status === "Scheduled").length;
    const posted = items.filter((i) => i.status === "Posted").length;
    const inProgress = items.filter((i) => i.status === "Drafting").length;
    return { total, scheduled, posted, inProgress };
  }, [items]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        view={view}
        setView={(v) => { setView(v); setSidebarOpen(false); }}
        platformFilter={platformFilter}
        setPlatformFilter={(p) => { setPlatformFilter(p); setSidebarOpen(false); }}
        stats={stats}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        userEmail={userEmail}
      />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar
          query={query}
          setQuery={setQuery}
          onAdd={() => addRow()}
          userEmail={userEmail}
          onSignOut={signOut}
          onMenuOpen={() => setSidebarOpen(true)}
          items={items}
          onContentGenerated={async () => { const rows = await listPosts(); setItems(rows); }}
        />
        <PageHeader stats={stats} />

        {view === "tasks" ? (
          <TasksView />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading your workspace…</div>
        ) : items.length === 0 ? (
          <EmptyState onSeed={seed} onAdd={() => addRow()} />
        ) : (
          <div className="flex-1">
            {view === "board" && (
              <BoardView
                items={filtered}
                onEdit={setEditingId}
                onMove={(id, s) => updateRow(id, { status: s })}
                onAdd={(s) => addRow({ status: s })}
                onBulkDelete={bulkDeleteRows}
              />
            )}
            {view === "calendar" && (
              <CalendarView
                items={filtered}
                onEdit={setEditingId}
                onAddOnDate={(d) => addRow({ date: d })}
                onReschedule={(id, d) => updateRow(id, { date: d })}
              />
            )}
            {view === "list" && (
              <ListView items={filtered} onEdit={setEditingId} onDelete={deleteRow} onBulkDelete={bulkDeleteRows} />
            )}
          </div>
        )}
      </main>

      {editing && (
        <EditDrawer
          item={editing}
          onClose={() => setEditingId(null)}
          onChange={(patch) => updateRow(editing.id, patch)}
          onDelete={() => deleteRow(editing.id)}
        />
      )}
    </div>
  );
}

/* ─────────────────────── Sidebar ─────────────────────── */

function Sidebar({
  view,
  setView,
  platformFilter,
  setPlatformFilter,
  stats,
  mobileOpen,
  onMobileClose,
  userEmail,
}: {
  view: View;
  setView: (v: View) => void;
  platformFilter: Platform | null;
  setPlatformFilter: (p: Platform | null) => void;
  stats: { total: number; scheduled: number; posted: number; inProgress: number };
  mobileOpen: boolean;
  onMobileClose: () => void;
  userEmail: string;
}) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface-2 px-4 py-5 transition-transform md:sticky md:top-0 md:z-auto md:bg-surface-2/60 md:backdrop-blur md:transition-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
      <div className="mb-7 flex items-center justify-between gap-2.5 px-1">
        <Link
          href="/"
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent-soft"
          aria-label="Go to home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-canvas">
            <LogoMark />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Cymate</div>
            <div className="text-[11px] text-muted">Content Studio</div>
          </div>
        </Link>
        <button
          onClick={onMobileClose}
          aria-label="Close menu"
          className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-ink md:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <SidebarSection label="Workspace">
        <SidebarItem
          active={view === "board"}
          onClick={() => setView("board")}
          icon={<BoardIcon />}
          label="Board"
        />
        <SidebarItem
          active={view === "calendar"}
          onClick={() => setView("calendar")}
          icon={<CalendarIcon />}
          label="Calendar"
        />
        <SidebarItem
          active={view === "list"}
          onClick={() => setView("list")}
          icon={<ListIcon />}
          label="List"
        />
        <SidebarItem
          active={view === "tasks"}
          onClick={() => setView("tasks")}
          icon={<TaskIcon />}
          label="Tasks"
        />
      </SidebarSection>

      <SidebarSection label="Platforms">
        <SidebarItem
          active={platformFilter === null}
          onClick={() => setPlatformFilter(null)}
          icon={<DotIcon className="text-muted" />}
          label="All channels"
          right={String(stats.total)}
        />
        {PLATFORMS.map((p) => (
          <SidebarItem
            key={p}
            active={platformFilter === p}
            onClick={() => setPlatformFilter(p)}
            icon={<PlatformGlyph platform={p} size={14} />}
            label={p}
          />
        ))}
      </SidebarSection>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-line bg-surface px-3 py-3 shadow-card">
          <div className="text-[11px] uppercase tracking-wider text-muted">This pipeline</div>
          <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-xs">
            <span className="text-ink-soft">In motion</span>
            <span className="text-right font-medium">{stats.inProgress}</span>
            <span className="text-ink-soft">Scheduled</span>
            <span className="text-right font-medium">{stats.scheduled}</span>
            <span className="text-ink-soft">Posted</span>
            <span className="text-right font-medium">{stats.posted}</span>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}

function AirtableSyncButton({ items }: { items: ContentItem[] }) {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSync = async () => {
    const idMap: Record<string, string> = JSON.parse(localStorage.getItem("airtable_id_map") ?? "{}");
    const syncedIds: string[] = JSON.parse(localStorage.getItem("airtable_synced_ids") ?? "[]");
    const toSync = items.filter((i) => SYNCED_STATUSES.has(i.status) && !idMap[i.id]);

    // Nothing new — skip server entirely
    if (!toSync.length) {
      setState("done");
      setMessage("Up to date");
      setTimeout(() => { setState("idle"); setMessage(""); }, 3000);
      return;
    }

    setState("syncing");
    setMessage("");
    const res = await fetch("/api/sync-airtable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posts: toSync }),
    });
    const result = await res.json();
    if (result.error) {
      setState("error");
      setMessage(result.error);
      setTimeout(() => { setState("idle"); setMessage(""); }, 5000);
    } else {
      if (result.newlySyncedIds?.length) {
        const updated = Array.from(new Set([...syncedIds, ...result.newlySyncedIds]));
        localStorage.setItem("airtable_synced_ids", JSON.stringify(updated));
      }
      if (result.airtableIdMap) {
        const map: Record<string, string> = JSON.parse(localStorage.getItem("airtable_id_map") ?? "{}");
        localStorage.setItem("airtable_id_map", JSON.stringify({ ...map, ...result.airtableIdMap }));
      }
      setState("done");
      setMessage(`${result.synced} synced`);
      setTimeout(() => { setState("idle"); setMessage(""); }, 4000);
    }
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleSync}
        disabled={state === "syncing"}
        title="Sync to Airtable"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
      >
        {state === "syncing" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        )}
        <span className="hidden sm:inline">
          {state === "syncing" ? "Syncing…" : state === "done" ? message : state === "error" ? "Error" : "Sync"}
        </span>
      </button>
      {message && state === "error" && (
        <span className="absolute top-full mt-1 right-0 whitespace-nowrap rounded bg-red-100 px-2 py-1 text-[11px] text-red-600">{message}</span>
      )}
    </div>
  );
}

function GenerateContentButton({ onGenerated }: { onGenerated: () => void }) {
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span className="hidden sm:inline">Generate</span>
      </button>
      {showModal && <GenerateModal onClose={() => setShowModal(false)} onGenerated={() => { setShowModal(false); onGenerated(); }} />}
    </>
  );
}

const TYPES_BY_PLATFORM: Record<string, string[]> = {
  Instagram: ["Static", "Carousel", "Reel", "Story"],
  LinkedIn:  ["Text", "Image", "Carousel", "Document"],
  Youtube:   ["Long-Form Video", "Short-Form Video"],
  Facebook:  ["Static", "Reel", "Carousel"],
  TikTok:    ["Short-Form Video", "Carousel"],
};

function GenerateModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: () => void }) {
  const [mode, setMode]             = useState<"week" | "single">("week");
  const [platform, setPlatform]     = useState("Instagram");
  const [contentType, setContentType] = useState("Static");
  const [date, setDate]             = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
  });
  const [topicHint, setTopicHint]   = useState("");
  const [genState, setGenState]     = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage]       = useState("");

  const types = TYPES_BY_PLATFORM[platform] ?? [];

  // When platform changes, reset contentType to first available
  useEffect(() => {
    setContentType(TYPES_BY_PLATFORM[platform]?.[0] ?? "");
  }, [platform]);

  const handleGenerate = async () => {
    setGenState("running");
    setMessage("");
    const supabase = supabaseBrowser();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const body = mode === "week"
        ? {}
        : { mode: "single", platform, contentType, date, topicHint: topicHint.trim() || undefined };
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const result = await res.json();
      if (result.error) {
        setGenState("error");
        setMessage(result.error);
      } else {
        setGenState("done");
        setMessage(mode === "week" ? `${result.generated} posts added` : "Post added to Drafting");
        onGenerated();
        setTimeout(onClose, 2000);
      }
    } catch {
      clearTimeout(timeout);
      setGenState("error");
      setMessage("Timed out — try again");
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg rounded-2xl border border-line-strong bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Generate content</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:bg-surface-2 hover:text-ink transition"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-5">

          {/* Mode */}
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">What do you need?</div>
            <div className="grid grid-cols-2 gap-2">
              {(["week", "single"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition ${
                    mode === m
                      ? "border-accent bg-accent/10"
                      : "border-line-strong bg-surface-2 hover:bg-surface-2 hover:border-line-strong"
                  }`}
                >
                  <span className="text-[18px]">{m === "week" ? "📅" : "✦"}</span>
                  <span className="text-[13px] font-semibold text-ink">{m === "week" ? "Full week" : "Single post"}</span>
                  <span className="text-[11px] leading-snug text-ink-soft">
                    {m === "week"
                      ? "5 IG posts + 3 LinkedIn posts, Mon – Fri"
                      : "Pick a platform, type, and optional topic"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Single-post config */}
          {mode === "single" && (
            <div className="flex flex-col gap-4">

              {/* Platform */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Platform</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(TYPES_BY_PLATFORM).map(p => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        platform === p
                          ? "border-accent bg-accent/10 text-ink"
                          : "border-line-strong bg-surface-2 text-ink-soft hover:text-ink"
                      }`}
                    >{p}</button>
                  ))}
                </div>
              </div>

              {/* Content type */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Content type</div>
                <div className="flex flex-wrap gap-1.5">
                  {types.map(t => (
                    <button
                      key={t}
                      onClick={() => setContentType(t)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        contentType === t
                          ? "border-accent bg-accent/10 text-ink"
                          : "border-line-strong bg-surface-2 text-ink-soft hover:text-ink"
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Date</div>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent transition"
                />
              </div>

              {/* Topic hint */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Topic hint <span className="normal-case font-normal tracking-normal text-muted">— optional</span>
                </div>
                <textarea
                  rows={2}
                  value={topicHint}
                  onChange={e => setTopicHint(e.target.value)}
                  placeholder="e.g. 'cold email deliverability for SaaS founders' — or leave blank and Claude decides"
                  className="w-full resize-none rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted outline-none focus:border-accent transition leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {genState === "error" && message && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-400 leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">
              {message}
            </div>
          )}

          {/* Success */}
          {genState === "done" && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
              {message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-[11px] text-muted leading-snug max-w-[220px]">
            {mode === "week"
              ? "Generates 8 posts. New drafts are added alongside existing content."
              : `${platform} · ${contentType}${date ? ` · ${date}` : ""}`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={genState === "running"}
              className="rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[13px] text-ink-soft hover:bg-surface-2 hover:text-ink transition disabled:opacity-40"
            >Cancel</button>
            <button
              onClick={handleGenerate}
              disabled={genState === "running" || genState === "done"}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {genState === "running" ? (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generating…</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Generate</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  active,
  onClick,
  icon,
  label,
  right,
}: {
  active?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  right?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active ? "bg-ink text-canvas" : "text-ink-soft hover:bg-line/60 hover:text-ink"
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {right !== undefined && (
        <span className={`text-[11px] ${active ? "text-canvas/70" : "text-muted"}`}>{right}</span>
      )}
    </button>
  );
}

/* ─────────────────────── Top bar + Header ─────────────────────── */

function TopBar({
  query,
  setQuery,
  onAdd,
  userEmail,
  onSignOut,
  onMenuOpen,
  items,
  onContentGenerated,
}: {
  query: string;
  setQuery: (v: string) => void;
  onAdd: () => void;
  userEmail: string;
  onSignOut: () => void;
  onMenuOpen: () => void;
  items: ContentItem[];
  onContentGenerated: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-canvas px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuOpen}
          aria-label="Open menu"
          className="-ml-1 rounded-md p-1.5 text-ink-soft hover:bg-line/60 hover:text-ink md:hidden"
        >
          <MenuIcon />
        </button>
        <div className="hidden items-center gap-2 text-xs text-muted md:flex">
          <Link href="/" className="hover:text-ink">Workspace</Link>
          <span className="text-line-strong">›</span>
          <Link href="/dashboard" className="text-ink-soft hover:text-ink">Content Studio</Link>
          <span className="text-line-strong">›</span>
          <span className="text-ink">Schedule</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 w-40 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent-soft md:w-64"
          />
        </div>
        {userEmail === "kenc@cymate.io" && <GenerateContentButton onGenerated={onContentGenerated} />}
        {userEmail === "kenc@cymate.io" && <AirtableSyncButton items={items} />}
        <button
          onClick={onAdd}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <PlusIcon /> <span className="hidden sm:inline">New post</span>
        </button>
        <UserMenu email={userEmail} onSignOut={onSignOut} />
      </div>
    </div>
  );
}

function UserMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const initial = (email || "?").charAt(0).toUpperCase();
  const themes: { value: Theme; label: string; icon: ReactNode }[] = [
    { value: "light", label: "Light", icon: <SunIcon /> },
    { value: "dark", label: "Dark", icon: <MoonIcon /> },
    { value: "system", label: "System", icon: <MonitorIcon /> },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-sm font-medium text-ink-soft ring-1 ring-line hover:ring-line-strong"
        aria-label="Account menu"
        title={email}
      >
        {initial}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-surface shadow-card-lg">
            <div className="border-b border-line px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted">Signed in as</div>
              <div className="mt-0.5 truncate text-sm">{email || "—"}</div>
            </div>
            <div className="border-b border-line px-3 py-2.5">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">Theme</div>
              <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
                {themes.map((t) => {
                  const active = theme === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] transition ${
                        active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink"
                      }`}
                      aria-pressed={active}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              <SettingsIcon /> Settings
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              <SignOutIcon /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PageHeader({ stats }: { stats: { total: number; scheduled: number; posted: number; inProgress: number } }) {
  return (
    <div className="sticky top-[57px] z-10 border-b border-line bg-canvas px-4 pb-4 pt-5 md:px-6 md:pb-5 md:pt-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end md:gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted md:text-[11px]">June 2026 · this quarter</div>
          <h1 className="serif mt-1.5 text-3xl font-normal leading-[1.05] tracking-tight md:mt-2 md:text-4xl">
            Content <em className="text-accent">in flight</em>
          </h1>
        </div>
        <div className="flex gap-5 md:gap-6">
          <Metric label="Total" value={stats.total} />
          <Metric label="Scheduled" value={stats.scheduled} accent />
          <Metric label="Posted" value={stats.posted} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`serif mt-1 text-3xl ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
    </div>
  );
}

/* ─────────────────────── Empty state ─────────────────────── */

function EmptyState({ onSeed, onAdd }: { onSeed: () => void; onAdd: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 pb-16">
      <div className="grain relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface px-10 py-14 text-center shadow-card-lg">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <SparkIcon />
        </div>
        <h2 className="serif text-3xl">A blank canvas, by design.</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          Drop in your first post — or seed the workspace with a few examples to feel the shape of it.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={onAdd}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.02]"
          >
            Create first post
          </button>
          <button
            onClick={onSeed}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Load examples
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Board view ─────────────────────── */

function sortCardsByStatus(cards: ContentItem[], status: Status): ContentItem[] {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "Posted") {
    // Most recently posted first (newest date first)
    return [...cards].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  if (status === "Scheduled") {
    // Soonest date first — today's content at the top
    return [...cards].sort((a, b) => {
      const da = a.date || "9999";
      const db = b.date || "9999";
      // Prioritise today
      const aToday = da === today ? 0 : 1;
      const bToday = db === today ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return da.localeCompare(db);
    });
  }
  // Drafting and everything else — ascending date (earliest first)
  return [...cards].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

function BoardView({
  items,
  onEdit,
  onMove,
  onAdd,
  onBulkDelete,
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onMove: (id: string, s: Status) => void;
  onAdd: (s: Status) => void;
  onBulkDelete: (ids: string[]) => void;
}) {
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleBulkMode = () => { setBulkMode((v) => !v); setSelected(new Set()); };
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} post${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    onBulkDelete([...selected]);
    setSelected(new Set());
    setBulkMode(false);
  };
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const board = boardScrollRef.current;
    const headerInner = headerInnerRef.current;
    if (!board || !headerInner) return;
    const sync = () => { headerInner.style.transform = `translateX(-${board.scrollLeft}px)`; };
    board.addEventListener("scroll", sync, { passive: true });
    return () => board.removeEventListener("scroll", sync);
  }, []);

  return (
    <div className="px-4 md:px-6">
      {/* Select toggle */}
      <div className="flex justify-end pb-2 pt-1">
        <button
          onClick={toggleBulkMode}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${bulkMode ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-surface-2 text-ink-soft hover:text-ink"}`}
        >
          {bulkMode ? "Cancel" : "Select"}
        </button>
      </div>

      <div className="sticky top-[148px] z-[5] -mx-4 overflow-hidden border-b border-line bg-canvas md:-mx-6">
        <div ref={headerInnerRef} className="flex w-max gap-4 px-4 py-2 will-change-transform md:px-6">
          {STATUSES.map((s) => {
            const cards = sortCardsByStatus(items.filter((i) => i.status === s), s);
            const meta = STATUS_META[s];
            return (
              <div key={s} className="flex w-72 shrink-0 items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted">{cards.length}</span>
                </div>
                {!bulkMode && (
                  <button onClick={() => onAdd(s)} className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-ink" aria-label={`Add to ${s}`}>
                    <PlusIcon size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div ref={boardScrollRef} className="-mx-4 overflow-x-auto px-4 pb-10 md:-mx-6 md:px-6">
        <div className="flex min-h-full gap-4 pt-3">
          {STATUSES.map((s) => {
            const cards = sortCardsByStatus(items.filter((i) => i.status === s), s);
            const isDropTarget = dragOver === s;
            return (
              <div
                key={s}
                className={`flex w-72 shrink-0 flex-col rounded-xl transition ${isDropTarget ? "bg-accent-soft/60 ring-2 ring-accent/40" : ""}`}
                onDragOver={(e) => { if (!dragId || bulkMode) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== s) setDragOver(s); }}
                onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; if (dragOver === s) setDragOver(null); }}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) onMove(id, s); setDragOver(null); setDragId(null); }}
              >
                <div className="flex flex-1 flex-col gap-2.5 px-2 pb-2 pt-1">
                  {cards.length === 0 && !bulkMode && (
                    <button onClick={() => onAdd(s)} className="rounded-xl border border-dashed border-line py-6 text-xs text-muted hover:border-line-strong hover:text-ink">
                      + Add card
                    </button>
                  )}
                  {cards.map((c) => (
                    <BoardCard
                      key={c.id}
                      item={c}
                      onClick={() => bulkMode ? toggleOne(c.id) : onEdit(c.id)}
                      onMove={onMove}
                      isDragging={!bulkMode && dragId === c.id}
                      onDragStart={() => !bulkMode && setDragId(c.id)}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                      bulkMode={bulkMode}
                      selected={selected.has(c.id)}
                      onToggleSelect={() => toggleOne(c.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3 shadow-xl">
          <span className="text-sm text-ink-soft">{selected.size} selected</span>
          <button onClick={handleBulkDelete} className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition">
            Delete {selected.size}
          </button>
        </div>
      )}
    </div>
  );
}

function BoardCard({
  item,
  onClick,
  onMove,
  isDragging,
  onDragStart,
  onDragEnd,
  bulkMode,
  selected,
  onToggleSelect,
}: {
  item: ContentItem;
  onClick: () => void;
  onMove: (id: string, s: Status) => void;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  bulkMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <div className="relative">{bulkMode && (
        <span
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          className="absolute left-2 top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border-2 border-white/30 bg-black/40 backdrop-blur-sm transition hover:bg-black/60"
        >
          {selected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </span>
      )}
    <div className={selected ? "ring-2 ring-accent rounded-xl" : ""}><div
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group cursor-grab select-none overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-lg active:cursor-grabbing ${isDragging ? "rotate-1 opacity-50" : ""}`}
    >
      {item.attachments[0] && (
        <div className="relative">
          {isVideoUrl(item.attachments[0]) ? (
            <video src={item.attachments[0]} className="h-32 w-full object-cover" muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.attachments[0]} alt="" className="h-32 w-full object-cover" loading="lazy" />
          )}
          {item.attachments.length > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium text-canvas backdrop-blur">
              +{item.attachments.length - 1}
            </span>
          )}
        </div>
      )}
      <div className="p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <DateChip date={item.date} />
        <StatusMenu
          status={item.status}
          onChange={(s) => onMove(item.id, s)}
          compact
        />
      </div>
      <div className="text-[15px] font-medium leading-snug text-ink">
        {item.title || <span className="text-muted">Untitled</span>}
      </div>
      {item.description && (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
          {item.description}
        </p>
      )}
      {item.reviewStatus && item.reviewStatus !== "pending" && (
        <div className="mt-2">
          <ReviewChip status={item.reviewStatus} />
        </div>
      )}
      {item.contentType && (
        <div className="mt-2">
          <ContentTypeChip type={item.contentType} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <PlatformStack platforms={item.platforms} />
        {item.performanceScore && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
            {item.performanceScore}
          </span>
        )}
      </div>
      </div>
    </div></div></div>
  );
}

/* ─────────────────────── Calendar view ─────────────────────── */

function CalendarView({
  items,
  onEdit,
  onAddOnDate,
  onReschedule,
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onAddOnDate: (date: string) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const days = monthDays(cursor);
  const byDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    items.forEach((i) => {
      if (!i.date) return;
      (map[i.date] ||= []).push(i);
    });
    return map;
  }, [items]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-6 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="rounded-md border border-line bg-surface p-1.5 text-ink-soft hover:border-line-strong hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft />
          </button>
          <h3 className="serif text-2xl">{monthLabel}</h3>
          <button
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="rounded-md border border-line bg-surface p-1.5 text-ink-soft hover:border-line-strong hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight />
          </button>
        </div>
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(1);
            setCursor(d);
          }}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft hover:border-line-strong hover:text-ink"
        >
          Today
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-3 py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(({ date, inMonth }, idx) => {
            const iso = date.toISOString().slice(0, 10);
            const dayItems = byDate[iso] ?? [];
            const isToday = iso === today;
            const isDropTarget = dragOver === iso;
            return (
              <div
                key={idx}
                className={`group min-h-28 border-b border-r border-line p-2 transition last:border-r-0 ${
                  inMonth ? "bg-surface" : "bg-surface-2 text-muted"
                } ${isDropTarget ? "bg-accent-soft/60 ring-2 ring-inset ring-accent/40" : ""}`}
                onDragOver={(e) => {
                  if (!dragId || !inMonth) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOver !== iso) setDragOver(iso);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  if (dragOver === iso) setDragOver(null);
                }}
                onDrop={(e) => {
                  if (!inMonth) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  if (id) onReschedule(id, iso);
                  setDragOver(null);
                  setDragId(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium ${
                      isToday ? "bg-ink text-canvas" : "text-ink-soft"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {inMonth && (
                    <button
                      onClick={() => onAddOnDate(iso)}
                      className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-ink"
                      aria-label="Add post"
                    >
                      <PlusIcon size={12} />
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      onClick={() => onEdit(it.id)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", it.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(it.id);
                      }}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                      className={`block w-full cursor-grab select-none truncate rounded px-1.5 py-1 text-left text-[11px] ring-1 transition hover:scale-[1.02] active:cursor-grabbing ${STATUS_META[it.status]?.tint ?? "bg-stone-100"} ${STATUS_META[it.status]?.text ?? "text-stone-600"} ${STATUS_META[it.status]?.ring ?? "ring-stone-200"} ${dragId === it.id ? "opacity-50" : ""}`}
                    >
                      {it.title || "Untitled"}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="px-1.5 text-[10px] text-muted">+{dayItems.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function monthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() });
  }
  return days;
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/* ─────────────────────── List view ─────────────────────── */

function ListView({
  items,
  onEdit,
  onDelete,
  onBulkDelete,
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleBulkMode = () => {
    setBulkMode((v) => !v);
    setSelected(new Set());
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} post${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    onBulkDelete([...selected]);
    setSelected(new Set());
    setBulkMode(false);
  };

  return (
    <div className="px-4 pb-10 md:px-6">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={toggleBulkMode}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${bulkMode ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-surface-2 text-ink-soft hover:text-ink"}`}
        >
          {bulkMode ? "Cancel" : "Select"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {/* Header */}
        <div className="hidden gap-4 border-b border-line bg-surface-2 px-5 py-3 text-[11px] uppercase tracking-wider text-muted md:grid"
          style={{ gridTemplateColumns: bulkMode ? "32px 2fr 120px 120px 1.5fr 120px 60px" : "2fr 120px 120px 1.5fr 120px 60px" }}>
          {bulkMode && (
            <span className="flex items-center">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 cursor-pointer accent-accent" />
            </span>
          )}
          <span>Title</span>
          <span>Date</span>
          <span>Status</span>
          <span>Platforms</span>
          <span>Performance</span>
          <span></span>
        </div>

        {items.length === 0 && (
          <div className="px-5 py-16 text-center text-sm text-muted">No posts match the current filter.</div>
        )}

        {items.map((it) => {
          const isSelected = selected.has(it.id);
          return (
            <div
              key={it.id}
              onClick={() => bulkMode ? toggleOne(it.id) : onEdit(it.id)}
              className={`group flex w-full cursor-pointer flex-col gap-2 border-b border-line px-4 py-3 text-left text-sm last:border-b-0 transition hover:bg-surface-2 md:grid md:items-center md:gap-4 md:px-5 ${isSelected ? "bg-accent/5" : ""}`}
              style={{ gridTemplateColumns: bulkMode ? "32px 2fr 120px 120px 1.5fr 120px 60px" : "2fr 120px 120px 1.5fr 120px 60px" }}
            >
              {bulkMode && (
                <span className="flex items-center" onClick={(e) => { e.stopPropagation(); toggleOne(it.id); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(it.id)} className="h-4 w-4 cursor-pointer accent-accent" />
                </span>
              )}
              <div className="flex min-w-0 items-center gap-3">
                {it.attachments[0] ? (
                  isVideoUrl(it.attachments[0]) ? (
                    <video src={it.attachments[0]} className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-line" muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.attachments[0]} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-line" loading="lazy" />
                  )
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted ring-1 ring-line">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.title || <span className="text-muted">Untitled</span>}</div>
                  {it.description && <div className="truncate text-xs text-ink-soft">{it.description}</div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-soft md:contents">
                <div className="md:block">{it.date ? formatDate(it.date) : <span className="text-muted">—</span>}</div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={it.status} />
                  {it.contentType && <ContentTypeChip type={it.contentType} />}
                </div>
                <div><PlatformStack platforms={it.platforms} /></div>
                <div className="md:block">{it.performanceScore || <span className="text-muted">—</span>}</div>
              </div>
              <div className="hidden md:block md:text-right">
                {!bulkMode && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); if (confirm("Delete this post?")) onDelete(it.id); }}
                    className="inline-block rounded p-1 opacity-0 transition group-hover:opacity-100 text-muted hover:text-red-600"
                  >
                    <TrashIcon />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3 shadow-xl">
          <span className="text-sm text-ink-soft">{selected.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            Delete {selected.size}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Edit drawer ─────────────────────── */

function EditDrawer({
  item,
  onClose,
  onChange,
  onDelete,
}: {
  item: ContentItem;
  onClose: () => void;
  onChange: (patch: Partial<ContentItem>) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 fade-in" onClick={onClose} />
      <div
        className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
        onClick={onClose}
      >
      <aside
        className="modal-in relative my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-canvas shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <StatusMenu status={item.status} onChange={(s) => onChange({ status: s })} />
            <span className="text-xs text-muted">·</span>
            <span className="text-xs text-ink-soft">{item.date ? formatDate(item.date) : "No date"}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-line/60 hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          <section>
            <input
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Post title…"
              className="w-full bg-transparent text-2xl font-medium leading-tight tracking-tight placeholder:text-muted focus:outline-none"
            />
          </section>

          {(item.status === "Review" || item.reviewStatus) && (
            <section>
              <ReviewPanel item={item} onChange={onChange} />
            </section>
          )}

          <section className="grid grid-cols-2 gap-4">
            <Field label="Publish date">
              <input
                type="date"
                value={item.date}
                onChange={(e) => onChange({ date: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Performance">
              <input
                value={item.performanceScore}
                onChange={(e) => onChange({ performanceScore: e.target.value })}
                className="input"
                placeholder="e.g. 12.4k views"
              />
            </Field>
          </section>

          <section>
            <Field label="Content type">
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_TYPES.map((t) => {
                  const active = item.contentType === t;
                  const m = CONTENT_TYPE_META[t];
                  return (
                    <button
                      key={t}
                      onClick={() => onChange({ contentType: active ? "" : t })}
                      className={`rounded-full px-2.5 py-1 text-xs transition ring-1 ${
                        active
                          ? `${m.tint} ${m.text} ${m.ring}`
                          : "bg-surface text-ink-soft ring-line hover:ring-line-strong"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>
          </section>

          {item.contentType === "Carousel" && (
            <section>
              <SlideEditor
                slides={item.slides}
                onChange={(slides) => onChange({ slides })}
              />
            </section>
          )}

          <section>
            <Field label="Platforms">
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => {
                  const active = item.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() =>
                        onChange({
                          platforms: active
                            ? item.platforms.filter((x) => x !== p)
                            : [...item.platforms, p],
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                        active
                          ? "bg-ink text-canvas"
                          : "bg-surface text-ink-soft ring-1 ring-line hover:ring-line-strong"
                      }`}
                    >
                      <PlatformGlyph platform={p} size={12} dark={active} />
                      {p}
                    </button>
                  );
                })}
              </div>
            </Field>
          </section>

          <section>
            <Field label="On-screen text">
              <textarea
                value={item.onScreenText}
                onChange={(e) => onChange({ onScreenText: e.target.value })}
                className="input min-h-16"
                placeholder="What viewers see overlaid on the video / image"
              />
            </Field>
          </section>

          <section>
            <Field label="Caption / description">
              <textarea
                value={item.description}
                onChange={(e) => onChange({ description: e.target.value })}
                className="input min-h-24"
                placeholder="The post copy"
              />
              <CharCounter text={item.description} platforms={item.platforms} />
            </Field>
          </section>

          <section>
            <Field label="Media">
              <MediaPicker
                postId={item.id}
                urls={item.attachments}
                platform={item.platforms[0] ?? ""}
                contentType={item.contentType}
                descriptionEmpty={!item.description.trim()}
                onChange={(urls) => onChange({ attachments: urls })}
                onCaptionGenerated={(caption) => onChange({ description: caption })}
              />
            </Field>
          </section>

          <section>
            <Field label="Notes">
              <textarea
                value={item.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
                className="input min-h-24"
                placeholder="Anything you don't want to forget"
              />
            </Field>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-3">
          <button
            onClick={() => {
              if (confirm("Delete this post?")) onDelete();
            }}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Delete post
          </button>
          <div className="flex items-center gap-2">
            <ShareButton item={item} onChange={onChange} />
            <button
              onClick={onClose}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-card"
            >
              Save & close
            </button>
          </div>
        </div>
      </aside>
      </div>
      <style>{`
        .input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--surface);
          padding: 8px 12px;
          font-size: 14px;
          color: var(--ink);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input::placeholder { color: var(--muted); }
        .input:focus {
          border-color: var(--line-strong);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      `}</style>
    </>
  );
}

function ShareButton({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (patch: Partial<ContentItem>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildUrl = (token: string) =>
    typeof window === "undefined" ? `/share/${token}` : `${window.location.origin}/share/${token}`;

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    let token = item.shareToken;
    if (!token) {
      const fresh = await ensureShareToken(item.id, "");
      if (fresh) {
        token = fresh;
        onChange({ shareToken: fresh });
      }
    }
    if (token) {
      try {
        await navigator.clipboard.writeText(buildUrl(token));
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        // fall back silently — the URL is still set and visible if we wanted to show it
      }
    }
    setBusy(false);
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={item.shareToken ? buildUrl(item.shareToken) : "Generate a share link"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-soft hover:border-line-strong hover:text-ink disabled:opacity-60"
    >
      <ShareIcon />
      {copied ? "Link copied" : busy ? "Working…" : item.shareToken ? "Copy share link" : "Share for review"}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

const REVIEWER = "Wesley Hoang";

function ReviewPanel({
  item,
  onChange,
}: {
  item: ContentItem;
  onChange: (patch: Partial<ContentItem>) => void;
}) {
  const current: ReviewStatus = item.reviewStatus || (item.status === "Review" ? "pending" : "");
  const meta = current && current !== "pending" ? REVIEW_STATUS_META[current as Exclude<ReviewStatus, "" | "pending">] : null;
  const pendingMeta = REVIEW_STATUS_META.pending;

  const stamp = item.reviewedAt
    ? new Date(item.reviewedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  const decide = (next: Exclude<ReviewStatus, "" | "pending">) => {
    // Click an active button to toggle it off — clears the review state.
    if (item.reviewStatus === next) {
      const patch: Partial<ContentItem> = {
        reviewStatus: "",
        reviewedBy: "",
        reviewedAt: "",
      };
      // Un-approving sends the card back to Review.
      if (next === "approved") patch.status = "Review";
      onChange(patch);
      return;
    }
    const patch: Partial<ContentItem> = {
      reviewStatus: next,
      reviewedBy: REVIEWER,
      reviewedAt: new Date().toISOString(),
    };
    if (next === "approved") patch.status = "Scheduled";
    else if (next === "needs-revision") patch.status = "Review";
    else if (next === "on-hold") patch.status = "Drafting";
    onChange(patch);
  };

  const btn = (
    next: Exclude<ReviewStatus, "" | "pending">,
    activeClass: string,
    idleClass: string,
    label: React.ReactNode
  ) => {
    const active = item.reviewStatus === next;
    return (
      <button
        type="button"
        onClick={() => decide(next)}
        aria-pressed={active}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${active ? activeClass : idleClass}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2/40">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Review</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            meta ? `${meta.tint} ${meta.text} ${meta.ring}` : `${pendingMeta.tint} ${pendingMeta.text} ${pendingMeta.ring}`
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta ? meta.dot : pendingMeta.dot}`} />
          {meta ? meta.label : pendingMeta.label}
        </span>
        {item.reviewedAt && (
          <span className="text-[11px] text-muted">
            {new Date(item.reviewedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        <Field label="Reviewer note">
          <textarea
            value={item.reviewNote}
            onChange={(e) => onChange({ reviewNote: e.target.value })}
            placeholder="Add a comment so the author knows what to change…"
            className="input min-h-20"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {btn(
            "approved",
            "bg-emerald-600 text-white shadow-card hover:bg-emerald-700",
            "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            <>✓ Approve</>
          )}
          {btn(
            "needs-revision",
            "bg-rose-600 text-white shadow-card hover:bg-rose-700",
            "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
            <>↺ Needs revision</>
          )}
          {btn(
            "on-hold",
            "bg-slate-700 text-white shadow-card hover:bg-slate-800",
            "border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
            <>⏸ Hold</>
          )}
        </div>
        <div className="text-[11px] text-muted">Click an active button again to undo.</div>
      </div>
    </div>
  );
}

function SlideEditor({
  slides,
  onChange,
}: {
  slides: string[];
  onChange: (slides: string[]) => void;
}) {
  const update = (i: number, val: string) => {
    const next = slides.slice();
    next[i] = val;
    onChange(next);
  };
  const addSlide = () => onChange([...slides, ""]);
  const removeSlide = (i: number) => onChange(slides.filter((_, idx) => idx !== i));
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = slides.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Slides
          {slides.length > 0 && (
            <span className="ml-1.5 normal-case tracking-normal text-ink-soft">· {slides.length}</span>
          )}
        </span>
      </div>
      <div className="space-y-2">
        {slides.length === 0 && (
          <div className="rounded-lg border border-dashed border-line bg-surface-2/40 px-3 py-3 text-xs text-muted">
            Add a slide for each frame of the carousel. The text here is what appears on each slide.
          </div>
        )}
        {slides.map((s, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-3 py-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                Slide {i + 1}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveSlide(i, -1)}
                  disabled={i === 0}
                  aria-label="Move slide up"
                  className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-ink disabled:opacity-30"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveSlide(i, 1)}
                  disabled={i === slides.length - 1}
                  aria-label="Move slide down"
                  className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-ink disabled:opacity-30"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeSlide(i)}
                  aria-label="Remove slide"
                  className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-red-600"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <textarea
              value={s}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`What appears on slide ${i + 1}…`}
              className="input min-h-16 rounded-none border-0 focus:shadow-none"
              style={{ boxShadow: "none" }}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addSlide}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-line bg-surface px-3 py-1.5 text-xs text-ink-soft hover:border-line-strong hover:text-ink"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Add slide
      </button>
    </div>
  );
}

function CharCounter({ text, platforms }: { text: string; platforms: Platform[] }) {
  if (platforms.length === 0) {
    return (
      <div className="mt-1.5 text-[11px] text-muted">
        {text.length} {text.length === 1 ? "character" : "characters"} · pick a platform to see its limit
      </div>
    );
  }
  const len = text.length;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {platforms.map((p) => {
        const limit = PLATFORM_LIMITS[p];
        const over = len > limit;
        const close = !over && len > limit * 0.9;
        return (
          <span
            key={p}
            className={
              over
                ? "font-medium text-red-600"
                : close
                ? "text-amber-600"
                : "text-ink-soft"
            }
          >
            {p}: {len}/{limit}
            {over && ` (−${len - limit})`}
          </span>
        );
      })}
    </div>
  );
}

const MAX_BYTES = 50 * 1024 * 1024;

function MediaPicker({
  postId,
  urls,
  platform,
  contentType,
  descriptionEmpty,
  onChange,
  onCaptionGenerated,
}: {
  postId: string;
  urls: string[];
  platform: string;
  contentType: string;
  descriptionEmpty: boolean;
  onChange: (urls: string[]) => void;
  onCaptionGenerated: (caption: string) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [mediaLink, setMediaLink] = useState("");
  const [mediaDescription, setMediaDescription] = useState("");
  const [linkFailed, setLinkFailed] = useState(false);

  const generateCaption = async (imageUrl: string) => {
    setGeneratingCaption(true);
    try {
      const sb = supabaseBrowser();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ imageUrl, platform, contentType }),
      });
      if (res.ok) {
        const { caption } = await res.json() as { caption: string };
        if (caption) onCaptionGenerated(caption);
      }
    } catch {
      // silent — caption generation is best-effort
    } finally {
      setGeneratingCaption(false);
    }
  };

  const generateCaptionFromLink = async () => {
    if (!mediaLink.trim()) return;
    setLinkFailed(false);
    setGeneratingCaption(true);
    try {
      const sb = supabaseBrowser();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
        body: JSON.stringify({ imageUrl: mediaLink.trim(), platform, contentType, description: mediaDescription }),
      });
      if (res.ok) {
        const { caption, fallback } = await res.json() as { caption: string; fallback?: boolean };
        if (caption) onCaptionGenerated(caption);
        if (fallback) setLinkFailed(true);
      }
    } catch {
      setLinkFailed(true);
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);

    const accepted: File[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        setError(`Skipped "${f.name}" — only images and videos are supported.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" is too large. Max 50MB per file.`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;

    setUploading((n) => n + accepted.length);
    const results = await Promise.all(accepted.map((f) => uploadMedia(f, postId)));
    setUploading((n) => Math.max(0, n - accepted.length));

    const next = [...urls];
    let failed = 0;
    let firstNewUrl: string | null = null;
    for (const r of results) {
      if (r) {
        if (!firstNewUrl) firstNewUrl = r.url;
        next.push(r.url);
      } else failed++;
    }
    if (failed > 0) {
      setError(`${failed} file${failed > 1 ? "s" : ""} failed to upload. Make sure the post-images bucket allows your file size.`);
    }
    if (next.length !== urls.length) {
      onChange(next);
      // Auto-generate caption from first uploaded media if description is empty
      if (firstNewUrl && descriptionEmpty) {
        generateCaption(firstNewUrl);
      }
    }
  };

  const removeAt = (idx: number) => {
    const target = urls[idx];
    const next = urls.filter((_, i) => i !== idx);
    onChange(next);
    removeMedia(target).catch(() => {});
  };

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {urls.map((u, i) => (
            <MediaTile
              key={u}
              url={u}
              index={i}
              isDragging={dragSrcIdx === i}
              isDropTarget={dragOverIdx === i && dragSrcIdx !== i}
              onRemove={() => removeAt(i)}
              onOpen={() => setPreviewIndex(i)}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("media-idx", String(i));
                setDragSrcIdx(i);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                if (i !== dragOverIdx) setDragOverIdx(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const src = parseInt(e.dataTransfer.getData("media-idx"), 10);
                if (isNaN(src) || src === i) { setDragSrcIdx(null); setDragOverIdx(null); return; }
                const next = [...urls];
                const [moved] = next.splice(src, 1);
                next.splice(i, 0, moved);
                onChange(next);
                setDragSrcIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                setDragSrcIdx(null);
                setDragOverIdx(null);
              }}
            />
          ))}
        </div>
      )}

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2 text-center text-xs text-ink-soft transition hover:border-line-strong hover:text-ink ${urls.length > 0 ? "px-4 py-3" : "px-4 py-6"}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {urls.length === 0 && (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
        )}
        <span>
          {uploading > 0
            ? `Uploading ${uploading} file${uploading > 1 ? "s" : ""}…`
            : urls.length === 0
            ? "Drop images or videos, or click to upload"
            : "Add more"}
        </span>
        <span className="text-[11px] text-muted">PNG · JPG · WebP · MP4 · MOV — up to 50MB each</span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          disabled={uploading > 0}
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {/* External media link + caption generator */}
      <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 space-y-2">
        <p className="text-[11px] font-medium text-ink-soft">Generate caption from a link (Google Drive, etc.)</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={mediaLink}
            onChange={(e) => { setMediaLink(e.target.value); setLinkFailed(false); setMediaDescription(""); }}
            placeholder="Paste a Drive or media link…"
            className="input flex-1 text-xs py-1.5"
          />
          <button
            onClick={generateCaptionFromLink}
            disabled={!mediaLink.trim() || generatingCaption}
            className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-surface disabled:opacity-40 transition hover:opacity-80"
          >
            Generate
          </button>
        </div>
        {linkFailed && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-amber-700">Could not view this link directly. Briefly describe what the media shows and we will generate the caption from that.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={mediaDescription}
                onChange={(e) => setMediaDescription(e.target.value)}
                placeholder="e.g. A short video showing cold email open rate stats"
                className="input flex-1 text-xs py-1.5"
              />
              <button
                onClick={generateCaptionFromLink}
                disabled={!mediaDescription.trim() || generatingCaption}
                className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-surface disabled:opacity-40 transition hover:opacity-80"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {generatingCaption && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 flex items-center gap-2">
          <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          Generating caption from your media…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</div>
      )}

      {previewIndex !== null && (
        <MediaLightbox urls={urls} initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      )}
    </div>
  );
}

function MediaTile({
  url,
  index,
  isDragging,
  isDropTarget,
  onRemove,
  onOpen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  url: string;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onRemove: () => void;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const name = basenameFromUrl(url);
  const video = isVideoUrl(url);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative overflow-hidden rounded-lg border bg-surface transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40 scale-95 border-accent" : isDropTarget ? "border-accent ring-2 ring-accent/40 scale-[1.02]" : "border-line"
      }`}
    >
      {index === 0 && (
        <span className="absolute top-1.5 left-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Cover</span>
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ${name}`}
        className="relative block aspect-square w-full bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {video ? (
          <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <ExpandIcon />
        </span>
      </button>
      <div className="flex items-center justify-between gap-1 border-t border-line bg-surface-2/60 px-1.5 py-1 text-[10px]">
        <span className="truncate text-ink-soft" title={name}>{name}</span>
        <div className="flex shrink-0 gap-0.5">
          <a
            href={downloadUrl(url, name)}
            download={name}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line/60 hover:text-ink"
            title="Download"
            aria-label={`Download ${name}`}
          >
            <DownloadIcon />
          </a>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line/60 hover:text-red-600"
            title="Remove"
            aria-label={`Remove ${name}`}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaLightbox({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const safeIndex = Math.max(0, Math.min(urls.length - 1, index));
  const url = urls[safeIndex];
  const name = basenameFromUrl(url);
  const video = isVideoUrl(url);
  const hasMany = urls.length > 1;
  const prev = () => setIndex((i) => (i - 1 + urls.length) % urls.length);
  const next = () => setIndex((i) => (i + 1) % urls.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMany) prev();
      else if (e.key === "ArrowRight" && hasMany) next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, hasMany, urls.length]);

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-label="Media preview"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-3 top-3 z-10 rounded-md bg-white/15 p-2 text-white hover:bg-white/30"
      >
        <CloseIcon />
      </button>
      <a
        href={downloadUrl(url, name)}
        download={name}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${name}`}
        className="absolute right-14 top-3 z-10 rounded-md bg-white/15 p-2 text-white hover:bg-white/30"
      >
        <DownloadIcon />
      </a>

      {hasMany && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
            {safeIndex + 1} / {urls.length}
          </div>
        </>
      )}

      <div className="max-h-full max-w-5xl cursor-default" onClick={(e) => e.stopPropagation()}>
        {video ? (
          <video
            key={url}
            src={url}
            controls
            autoPlay
            className="max-h-[88vh] max-w-full rounded-lg shadow-card-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={name}
            className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-card-lg"
          />
        )}
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────── Shared bits ─────────────────────── */

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  if (!m) return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-stone-100 text-stone-600 ring-1 ring-stone-200">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.tint} ${m.text} ring-1 ${m.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function ContentTypeChip({ type }: { type: ContentType }) {
  const m = CONTENT_TYPE_META[type];
  if (!m) return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 bg-stone-100 text-stone-600 ring-stone-200">{type}</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.tint} ${m.text} ${m.ring}`}>
      {type}
    </span>
  );
}

function ReviewChip({ status }: { status: ReviewStatus }) {
  if (!status || status === "pending") return null;
  const m = REVIEW_STATUS_META[status as Exclude<ReviewStatus, "" | "pending">];
  if (!m) return null;
  const glyph = status === "approved" ? "✓" : status === "needs-revision" ? "↺" : "⏸";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.tint} ${m.text} ${m.ring}`} title={m.label}>
      <span aria-hidden>{glyph}</span>
      {m.label}
    </span>
  );
}

function StatusMenu({
  status,
  onChange,
  compact,
}: {
  status: Status;
  onChange: (s: Status) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const m = STATUS_META[status];
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.tint} ${m.text} ring-1 ${m.ring} hover:brightness-95`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
        {compact ? m.label.slice(0, 8) : m.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 z-40 mt-1.5 w-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-card-lg">
            {STATUSES.map((s) => {
              const sm = STATUS_META[s];
              return (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2 ${
                    s === status ? "bg-surface-2" : ""
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
                  <span className="flex-1">{sm.label}</span>
                  {s === status && <CheckIcon />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DateChip({ date }: { date: string }) {
  if (!date) return <span className="text-[11px] text-muted">No date</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
      <CalendarIcon size={11} />
      {formatDate(date)}
    </span>
  );
}

function PlatformStack({ platforms }: { platforms: Platform[] }) {
  if (platforms.length === 0) return <span className="text-[11px] text-muted">No channels</span>;
  return (
    <div className="flex -space-x-1.5">
      {platforms.map((p) => (
        <span
          key={p}
          title={p}
          className="flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface"
          style={{ background: PLATFORM_META[p].bg }}
        >
          <PlatformGlyph platform={p} size={11} />
        </span>
      ))}
    </div>
  );
}

function formatDate(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ─────────────────────── Icons ─────────────────────── */

function PlatformGlyph({ platform, size = 12, dark }: { platform: Platform; size?: number; dark?: boolean }) {
  const color = dark ? "#f7f5f0" : PLATFORM_META[platform].color;
  const props = { width: size, height: size, fill: color, viewBox: "0 0 24 24" };
  switch (platform) {
    case "LinkedIn":
      return (
        <svg {...props}><path d="M20.4 3H3.6A.6.6 0 003 3.6v16.8a.6.6 0 00.6.6h16.8a.6.6 0 00.6-.6V3.6a.6.6 0 00-.6-.6zM8.3 18.3H5.7V10h2.6v8.3zM7 8.9a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11.3 9.4h-2.6v-4c0-1 0-2.2-1.4-2.2s-1.6 1.1-1.6 2.2v4h-2.6V10h2.5v1.1h.1a2.8 2.8 0 012.5-1.3c2.7 0 3.2 1.7 3.2 4v4.5z"/></svg>
      );
    case "Instagram":
      return (
        <svg {...props} fill="none" stroke={color} strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5"/>
          <circle cx="12" cy="12" r="4"/>
          <circle cx="17.5" cy="6.5" r="1" fill={color} stroke="none"/>
        </svg>
      );
    case "Youtube":
      return (
        <svg {...props}><path d="M23 7.5s-.2-1.6-.9-2.3c-.8-.9-1.7-.9-2.2-.9C16.5 4 12 4 12 4s-4.5 0-7.9.3c-.5 0-1.4 0-2.2.9C1.2 5.9 1 7.5 1 7.5S.8 9.4.8 11.3v1.4c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.8.9 1.9.9 2.4 1 1.8.1 7.7.3 7.7.3s4.5 0 7.9-.3c.5 0 1.4 0 2.2-.9.7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.4c0-1.9-.2-3.8-.2-3.8zM9.8 14.7V8.3l5.7 3.2-5.7 3.2z"/></svg>
      );
    case "TikTok":
      return (
        <svg {...props}><path d="M19.6 7.3a5.4 5.4 0 01-3.2-1V15a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.1v2.7a3 3 0 102 2.9V3h2.6a5.4 5.4 0 003.4 3.6v2.6z"/></svg>
      );
    case "X":
      return (
        <svg {...props}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
      );
    case "Facebook":
      return (
        <svg {...props}><path d="M22 12a10 10 0 10-11.6 9.9V14.9H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z"/></svg>
      );
  }
}

function LogoMark() {
  return (
    <span className="text-[11px] font-semibold tracking-tight">CS</span>
  );
}
function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
  );
}
function TaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M3 17h6M13 7h8M13 12h8M13 17h5"/></svg>
  );
}

/* ─────────────────────── Tasks view ─────────────────────── */

function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<"today" | "week" | "completed">("today");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState<TaskCategory>("Cold Email");
  const [newDeadline, setNewDeadline] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTasks(loadTasks()); }, []);

  const persist = (next: Task[]) => { setTasks(next); saveTasks(next); };

  const addTask = () => {
    if (!newTitle.trim()) return;
    const t: Task = { id: crypto.randomUUID(), title: newTitle.trim(), description: newDesc.trim(), category: newCat, deadline: newDeadline, done: false, createdAt: new Date().toISOString() };
    persist([...tasks, t]);
    setNewTitle(""); setNewDesc(""); setNewDeadline(""); setAdding(false);
  };

  const toggle = (id: string) => persist(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id: string) => persist(tasks.filter(t => t.id !== id));
  const updateDeadline = (id: string, d: string) => persist(tasks.map(t => t.id === id ? { ...t, deadline: d } : t));

  const today = todayStr();
  const done = tasks.filter(t => t.done).length;

  // Week grid helpers
  const weekDays = (() => {
    const d = new Date();
    const dow = d.getDay(); // 0=Sun
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 5 }, (_, i) => {
      const day = new Date(mon); day.setDate(mon.getDate() + i);
      return { label: ["Mon","Tue","Wed","Thu","Fri"][i], date: day.toISOString().slice(0, 10) };
    });
  })();

  const tasksByDay = (date: string) => tasks.filter(t => t.deadline === date);

  // Today view: overdue first, then by deadline, then no deadline
  const sorted = [...tasks].sort((a, b) => {
    const ao = isOverdue(a), bo = isOverdue(b);
    if (ao !== bo) return ao ? -1 : 1;
    if (!a.deadline && b.deadline) return 1;
    if (a.deadline && !b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  const grouped = TASK_CATEGORIES.reduce<Record<TaskCategory, Task[]>>((acc, cat) => {
    acc[cat] = sorted.filter(t => t.category === cat && !t.done);
    return acc;
  }, {} as Record<TaskCategory, Task[]>);

  const completedTasks = [...tasks].filter(t => t.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex h-full flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Tasks</h2>
          <p className="text-[11px] text-muted">{done} of {tasks.length} done</p>
        </div>
        <button
          onClick={() => { setAdding(true); setTimeout(() => titleRef.current?.focus(), 50); }}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-surface-2 hover:text-ink transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add task
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-line pb-0">
        {(["today","week","completed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[12px] font-medium transition border-b-2 -mb-px ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink-soft"}`}>
            {t === "today" ? "All tasks" : t === "week" ? "This week" : `Completed${completedTasks.length ? ` · ${completedTasks.length}` : ""}`}
          </button>
        ))}
      </div>

      {/* Add task form */}
      {adding && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
          <input
            ref={titleRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setAdding(false); }}
            placeholder="Task title…"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted outline-none focus:border-accent"
          />
          <textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description — what needs to be done? (optional)"
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted outline-none focus:border-accent leading-relaxed"
          />
          <div className="flex gap-2">
            <select
              value={newCat}
              onChange={e => setNewCat(e.target.value as TaskCategory)}
              className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            >
              {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="date"
              value={newDeadline}
              onChange={e => setNewDeadline(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addTask} className="flex-1 rounded-lg bg-accent py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition">Add</button>
            <button onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-line bg-surface py-1.5 text-[12px] text-ink-soft hover:bg-surface-2 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* All tasks view */}
      {tab === "today" && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {tasks.length === 0 && !adding && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 text-3xl">✓</div>
              <p className="text-sm font-medium text-ink-soft">No tasks yet</p>
              <p className="text-[11px] text-muted mt-1">Add your first task above</p>
            </div>
          )}
          {TASK_CATEGORIES.map(cat => {
            const catTasks = grouped[cat];
            if (catTasks.length === 0) return null;
            const m = TASK_CAT_META[cat];
            return (
              <div key={cat}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{cat}</span>
                  <span className="text-[10px] text-muted">{catTasks.filter(t=>!t.done).length} left</span>
                </div>
                <div className="space-y-1.5">
                  {catTasks.map(t => {
                    const overdue = isOverdue(t);
                    return (
                      <div key={t.id}
                        className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                          overdue ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                          : "border-line bg-surface hover:border-line-strong"
                        }`}
                      >
                        {/* Checkbox */}
                        <button onClick={() => toggle(t.id)}
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                            t.done ? "border-accent bg-accent" : overdue ? "border-red-400" : "border-line-strong hover:border-accent"
                          }`}
                        >
                          {t.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>

                        {/* Title + description */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-[13px] leading-snug ${t.done ? "line-through text-muted" : overdue ? "text-red-700 dark:text-red-400 font-medium" : "text-ink"}`}>
                            {t.title}
                          </span>
                          {t.description && (
                            <p className={`mt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap ${t.done ? "text-muted line-through" : "text-ink-soft"}`}>
                              {t.description}
                            </p>
                          )}
                        </div>

                        {/* Deadline + overdue badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {overdue && !t.done && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/40 dark:text-red-400">Overdue</span>
                          )}
                          <input
                            type="date"
                            value={t.deadline}
                            onChange={e => updateDeadline(t.id, e.target.value)}
                            className={`rounded-md border px-1.5 py-0.5 text-[11px] outline-none focus:border-accent transition ${
                              overdue ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-transparent dark:text-red-400"
                              : "border-line bg-surface-2 text-muted"
                            }`}
                          />
                          <button onClick={() => remove(t.id)}
                            className="hidden rounded p-0.5 text-muted hover:bg-red-50 hover:text-red-500 group-hover:flex dark:hover:bg-red-950/40"
                            aria-label="Delete task"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed view */}
      {tab === "completed" && (
        <div className="flex-1 overflow-y-auto">
          {completedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 text-3xl">○</div>
              <p className="text-sm font-medium text-ink-soft">Nothing completed yet</p>
              <p className="text-[11px] text-muted mt-1">Finished tasks will appear here</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {completedTasks.map(t => {
                const m = TASK_CAT_META[t.category];
                return (
                  <div key={t.id} className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 opacity-60 transition hover:opacity-80">
                    <button onClick={() => toggle(t.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent bg-accent transition"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <span className="flex-1 text-[13px] line-through text-muted">{t.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${m.bg} ${m.text} ${m.ring}`}>{t.category}</span>
                    {t.deadline && <span className="text-[11px] text-muted">{t.deadline}</span>}
                    <button onClick={() => remove(t.id)}
                      className="hidden rounded p-0.5 text-muted hover:bg-red-50 hover:text-red-500 group-hover:flex dark:hover:bg-red-950/40"
                      aria-label="Delete task"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekly view */}
      {tab === "week" && (
        <div className="flex-1 overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-5 gap-3">
            {weekDays.map(({ label, date }) => {
              const dayTasks = tasksByDay(date);
              const isToday = date === today;
              return (
                <div key={date} className={`rounded-xl border ${isToday ? "border-accent/40 bg-accent/5" : "border-line bg-surface"}`}>
                  <div className={`border-b px-3 py-2 ${isToday ? "border-accent/30" : "border-line"}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-widest ${isToday ? "text-accent" : "text-muted"}`}>{label}</div>
                    <div className={`text-[11px] ${isToday ? "font-semibold text-accent" : "text-muted"}`}>
                      {new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="space-y-1.5 p-2">
                    {dayTasks.length === 0 && (
                      <div className="py-3 text-center text-[10px] text-muted">No tasks</div>
                    )}
                    {dayTasks.map(t => {
                      const m = TASK_CAT_META[t.category];
                      return (
                        <button key={t.id} onClick={() => toggle(t.id)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium ring-1 transition ${m.bg} ${m.text} ${m.ring} ${t.done ? "opacity-40 line-through" : ""}`}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  );
}
function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  );
}
function BoardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="18" rx="1"/><rect x="11" y="3" width="6" height="12" rx="1"/><rect x="19" y="3" width="2" height="8" rx="1"/></svg>
  );
}
function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
  );
}
function DotIcon({ className = "" }: { className?: string }) {
  return <svg className={className} width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor"/></svg>;
}
function ChevronDown({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  );
}
function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  );
}
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
  );
}
function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  );
}
function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/></svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  );
}
function SunIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
  );
}
function MoonIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  );
}
function MonitorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  );
}
