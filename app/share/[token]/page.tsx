"use client";

import { useEffect, useState, use } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";
import {
  PLATFORM_META,
  REVIEW_STATUS_META,
  STATUS_META,
  type Platform,
  type ReviewStatus,
  type Status,
} from "../../../lib/types";
import { isVideoUrl, basenameFromUrl, downloadUrl } from "../../../lib/storage";

type SharedPost = {
  id: string;
  title: string | null;
  date: string | null;
  on_screen_text: string | null;
  description: string | null;
  platforms: string[] | null;
  attachment_urls: string[] | null;
  status: string;
  content_type: string | null;
  slides: string[] | null;
  review_status: string | null;
  review_note: string | null;
  reviewed_at: string | null;
};

type ReviewAction = Exclude<ReviewStatus, "" | "pending">;

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [post, setPost] = useState<SharedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<ReviewAction | "" | null>(null);

  const load = async () => {
    setLoading(true);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.rpc("get_shared_post", { p_token: token });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      setError("This link is no longer valid.");
      return;
    }
    setPost(row);
    setNote(row.review_note ?? "");
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (action: ReviewAction) => {
    if (!post) return;
    const next = post.review_status === action ? "" : action;
    setSubmitting(next === "" ? "" : next);
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc("review_shared_post", {
      p_token: token,
      p_action: next,
      p_note: note,
    });
    setSubmitting(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-canvas text-[11px] font-semibold">CS</div>
        <h1 className="serif text-3xl">This link isn&apos;t available.</h1>
        <p className="mt-3 max-w-sm text-sm text-ink-soft">
          {error || "The owner may have revoked it, or the URL is incorrect."}
        </p>
      </div>
    );
  }

  const statusMeta = STATUS_META[post.status as Status] ?? STATUS_META.Idea;
  const reviewMeta = post.review_status && post.review_status !== "pending"
    ? REVIEW_STATUS_META[post.review_status as Exclude<ReviewStatus, "" | "pending">]
    : null;
  const stamp = post.reviewed_at
    ? new Date(post.reviewed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const formattedDate = post.date
    ? new Date(post.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "No date";
  const platforms = (post.platforms ?? []) as Platform[];
  const attachments = post.attachment_urls ?? [];
  const slides = post.slides ?? [];

  const action = (next: ReviewAction, primary = false, danger = false) => {
    const active = post.review_status === next;
    const base = "rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50";
    let cls: string;
    if (active) {
      cls = primary
        ? "bg-emerald-600 text-white shadow-card"
        : danger
        ? "bg-rose-600 text-white shadow-card"
        : "bg-slate-700 text-white shadow-card";
    } else {
      cls = primary
        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : danger
        ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
        : "border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink";
    }
    return { base: `${base} ${cls}`, active };
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-canvas">
              <span className="text-[11px] font-semibold tracking-tight">CS</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Cymate</div>
              <div className="text-[11px] text-muted">Content Studio</div>
            </div>
          </a>
          <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
            Shared for review
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{formattedDate}</div>
        <h1 className="serif mt-2 text-4xl leading-tight tracking-tight md:text-5xl">
          {post.title || "Untitled"}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${statusMeta.tint} ${statusMeta.text} ring-1 ${statusMeta.ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
          {reviewMeta && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${reviewMeta.tint} ${reviewMeta.text} ring-1 ${reviewMeta.ring}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${reviewMeta.dot}`} />
              {reviewMeta.label}
            </span>
          )}
          {post.content_type && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-ink-soft ring-1 ring-line">
              {post.content_type}
            </span>
          )}
          {platforms.length > 0 && (
            <div className="flex -space-x-1.5">
              {platforms.map((p) => (
                <span
                  key={p}
                  title={p}
                  className="flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-canvas"
                  style={{ background: PLATFORM_META[p]?.bg ?? "#eee", color: PLATFORM_META[p]?.color ?? "#000" }}
                >
                  <span className="text-[9px] font-semibold">{p[0]}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {post.description && (
          <Section label="Caption / description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{post.description}</p>
          </Section>
        )}

        {post.on_screen_text && (
          <Section label="On-screen text">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{post.on_screen_text}</p>
          </Section>
        )}

        {slides.length > 0 && (
          <Section label={`Slides · ${slides.length}`}>
            <div className="space-y-2">
              {slides.map((s, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="border-b border-line bg-surface-2/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                    Slide {i + 1}
                  </div>
                  <div className="whitespace-pre-wrap px-3 py-2 text-sm text-ink">{s || <span className="text-muted">empty</span>}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {attachments.length > 0 && (
          <Section label={`Media · ${attachments.length}`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachments.map((u) => {
                const name = basenameFromUrl(u);
                const video = isVideoUrl(u);
                return (
                  <div key={u} className="group overflow-hidden rounded-lg border border-line bg-surface">
                    <div className="aspect-square w-full bg-surface-2">
                      {video ? (
                        <video src={u} className="h-full w-full object-cover" muted playsInline preload="metadata" controls />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u} alt={name} className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-line bg-surface-2/60 px-2 py-1 text-[11px]">
                      <span className="truncate text-ink-soft" title={name}>{name}</span>
                      <a
                        href={downloadUrl(u, name)}
                        download={name}
                        className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line/60 hover:text-ink"
                      >
                        ↓
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section label="Your review">
          {stamp && post.review_status && post.review_status !== "pending" && (
            <div className="mb-3 text-[11px] text-muted">Last action {stamp}</div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a comment for the author (optional)…"
            className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {(() => {
              const a = action("approved", true);
              return (
                <button onClick={() => submit("approved")} disabled={submitting !== null} className={a.base}>
                  {submitting === "approved" ? "Saving…" : a.active ? "✓ Approved (click to undo)" : "✓ Approve"}
                </button>
              );
            })()}
            {(() => {
              const a = action("needs-revision", false, true);
              return (
                <button onClick={() => submit("needs-revision")} disabled={submitting !== null} className={a.base}>
                  {submitting === "needs-revision" ? "Saving…" : a.active ? "↺ Needs revision (click to undo)" : "↺ Needs revision"}
                </button>
              );
            })()}
            {(() => {
              const a = action("on-hold");
              return (
                <button onClick={() => submit("on-hold")} disabled={submitting !== null} className={a.base}>
                  {submitting === "on-hold" ? "Saving…" : a.active ? "⏸ On hold (click to undo)" : "⏸ Hold"}
                </button>
              );
            })()}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Your action is recorded immediately. The owner sees it in their workspace within seconds.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      {children}
    </section>
  );
}
