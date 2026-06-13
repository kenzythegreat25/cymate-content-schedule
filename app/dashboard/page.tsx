"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ContentItem,
  PLATFORMS,
  PLATFORM_META,
  STATUSES,
  STATUS_META,
  Platform,
  Status,
  emptyItem,
} from "../../lib/types";
import { createPost, deletePost, listPosts, updatePost } from "../../lib/storage";
import { supabaseBrowser } from "../../lib/supabase/client";
import { useTheme, type Theme } from "../../lib/theme";

type View = "board" | "calendar" | "list";

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("board");
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");

  const pendingPatches = useRef<Record<string, Partial<ContentItem>>>({});
  const flushTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserEmail(userData.user?.email ?? "");
      const rows = await listPosts();
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    scheduleFlush(id, patch);
  };

  const deleteRow = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
    delete pendingPatches.current[id];
    clearTimeout(flushTimers.current[id]);
    await deletePost(id);
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
    const inProgress = items.filter((i) => i.status === "Drafting" || i.status === "Idea").length;
    return { total, scheduled, posted, inProgress };
  }, [items]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        view={view}
        setView={setView}
        platformFilter={platformFilter}
        setPlatformFilter={setPlatformFilter}
        stats={stats}
      />
      <main className="flex min-h-screen flex-1 flex-col">
        <TopBar
          query={query}
          setQuery={setQuery}
          onAdd={() => addRow()}
          userEmail={userEmail}
          onSignOut={signOut}
        />
        <PageHeader stats={stats} />

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading your workspace…</div>
        ) : items.length === 0 ? (
          <EmptyState onSeed={seed} onAdd={() => addRow()} />
        ) : (
          <div className="flex-1 overflow-hidden">
            {view === "board" && (
              <BoardView
                items={filtered}
                onEdit={setEditingId}
                onMove={(id, s) => updateRow(id, { status: s })}
                onAdd={(s) => addRow({ status: s })}
              />
            )}
            {view === "calendar" && (
              <CalendarView
                items={filtered}
                onEdit={setEditingId}
                onAddOnDate={(d) => addRow({ date: d })}
              />
            )}
            {view === "list" && (
              <ListView items={filtered} onEdit={setEditingId} onDelete={deleteRow} />
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
}: {
  view: View;
  setView: (v: View) => void;
  platformFilter: Platform | null;
  setPlatformFilter: (p: Platform | null) => void;
  stats: { total: number; scheduled: number; posted: number; inProgress: number };
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface-2/60 px-4 py-5 backdrop-blur md:flex">
      <div className="mb-7 flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-canvas">
          <LogoMark />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Cymate</div>
          <div className="text-[11px] text-muted">Content Studio</div>
        </div>
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

      <div className="mt-auto rounded-xl border border-line bg-surface px-3 py-3 shadow-card">
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
    </aside>
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
}: {
  query: string;
  setQuery: (v: string) => void;
  onAdd: () => void;
  userEmail: string;
  onSignOut: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Workspace</span>
        <span className="text-line-strong">›</span>
        <span className="text-ink-soft">Content Studio</span>
        <span className="text-line-strong">›</span>
        <span className="text-ink">Schedule</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts…"
            className="h-9 w-64 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
        </div>
        <button
          onClick={onAdd}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <PlusIcon /> New post
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
            <button
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
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
    <div className="px-6 pb-6 pt-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">June 2026 · this quarter</div>
          <h1 className="serif mt-2 text-5xl font-normal leading-[1.05] tracking-tight">
            Content <em className="text-accent">in flight</em>
          </h1>
          <p className="mt-2 max-w-md text-sm text-ink-soft">
            One workspace for every post — from raw idea to performance lookback.
          </p>
        </div>
        <div className="hidden gap-6 sm:flex">
          <Metric label="Total posts" value={stats.total} />
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

function BoardView({
  items,
  onEdit,
  onMove,
  onAdd,
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onMove: (id: string, s: Status) => void;
  onAdd: (s: Status) => void;
}) {
  return (
    <div className="h-full overflow-x-auto px-6 pb-10">
      <div className="flex min-h-full gap-4">
        {STATUSES.map((s) => {
          const cards = items.filter((i) => i.status === s);
          const meta = STATUS_META[s];
          return (
            <div key={s} className="flex w-72 shrink-0 flex-col">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted">{cards.length}</span>
                </div>
                <button
                  onClick={() => onAdd(s)}
                  className="rounded-md p-1 text-muted hover:bg-line/60 hover:text-ink"
                  aria-label={`Add to ${s}`}
                  title={`Add to ${s}`}
                >
                  <PlusIcon size={14} />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                {cards.length === 0 && (
                  <button
                    onClick={() => onAdd(s)}
                    className="rounded-xl border border-dashed border-line py-6 text-xs text-muted hover:border-line-strong hover:text-ink"
                  >
                    + Add card
                  </button>
                )}
                {cards.map((c) => (
                  <BoardCard key={c.id} item={c} onClick={() => onEdit(c.id)} onMove={onMove} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  item,
  onClick,
  onMove,
}: {
  item: ContentItem;
  onClick: () => void;
  onMove: (id: string, s: Status) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-line bg-surface p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-lg"
    >
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
      <div className="mt-3 flex items-center justify-between">
        <PlatformStack platforms={item.platforms} />
        {item.performanceScore && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
            {item.performanceScore}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Calendar view ─────────────────────── */

function CalendarView({
  items,
  onEdit,
  onAddOnDate,
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onAddOnDate: (date: string) => void;
}) {
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
            return (
              <div
                key={idx}
                className={`group min-h-28 border-b border-r border-line p-2 last:border-r-0 ${
                  inMonth ? "bg-surface" : "bg-surface-2 text-muted"
                }`}
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
                      className={`block w-full truncate rounded px-1.5 py-1 text-left text-[11px] ring-1 transition hover:scale-[1.02] ${STATUS_META[it.status].tint} ${STATUS_META[it.status].text} ${STATUS_META[it.status].ring}`}
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
}: {
  items: ContentItem[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="px-6 pb-10">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-[2fr_120px_120px_1.5fr_120px_60px] gap-4 border-b border-line bg-surface-2 px-5 py-3 text-[11px] uppercase tracking-wider text-muted">
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
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onEdit(it.id)}
            className="group grid w-full grid-cols-[2fr_120px_120px_1.5fr_120px_60px] items-center gap-4 border-b border-line px-5 py-3 text-left text-sm last:border-b-0 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{it.title || <span className="text-muted">Untitled</span>}</div>
              {it.description && <div className="truncate text-xs text-ink-soft">{it.description}</div>}
            </div>
            <div className="text-xs text-ink-soft">
              {it.date ? formatDate(it.date) : <span className="text-muted">—</span>}
            </div>
            <div>
              <StatusBadge status={it.status} />
            </div>
            <div>
              <PlatformStack platforms={it.platforms} />
            </div>
            <div className="text-xs text-ink-soft">
              {it.performanceScore || <span className="text-muted">—</span>}
            </div>
            <div className="text-right">
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this post?")) onDelete(it.id);
                }}
                className="inline-block rounded p-1 opacity-0 transition group-hover:opacity-100 text-muted hover:text-red-600"
              >
                <TrashIcon />
              </span>
            </div>
          </button>
        ))}
      </div>
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
      <div className="fixed inset-0 z-30 bg-ink/30 fade-in" onClick={onClose} />
      <aside className="drawer-in fixed right-0 top-0 z-40 flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-card-lg">
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
            </Field>
          </section>

          <section>
            <Field label="Attachment URL">
              <input
                value={item.attachments}
                onChange={(e) => onChange({ attachments: e.target.value })}
                className="input"
                placeholder="https://…"
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

        <div className="flex items-center justify-between border-t border-line px-6 py-3">
          <button
            onClick={() => {
              if (confirm("Delete this post?")) onDelete();
            }}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Delete post
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-card"
          >
            Save & close
          </button>
        </div>
      </aside>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

/* ─────────────────────── Shared bits ─────────────────────── */

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.tint} ${m.text} ring-1 ${m.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 5l8 14L20 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
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
