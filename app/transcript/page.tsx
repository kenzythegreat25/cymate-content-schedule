"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { createPost } from "../../lib/storage";

type Clip = {
  title: string;
  excerpt: string;
  estimatedDuration: string;
  description: string;
  why: string;
  score?: number;
};

const LENGTH_OPTIONS = [
  { value: "30–60s", label: "30–60 sec" },
  { value: "60–90s", label: "60–90 sec" },
  { value: "3–10min", label: "3–10 min" },
];

export default function TranscriptPage() {
  const [transcript, setTranscript] = useState("");
  const [selectedLengths, setSelectedLengths] = useState<Set<string>>(new Set(["60–90s"]));
  const [clipCount, setClipCount] = useState(10);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [clips, setClips] = useState<Clip[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleLength = (val: string) => {
    setSelectedLengths((prev) => {
      const next = new Set(prev);
      if (next.has(val)) {
        if (next.size === 1) return prev;
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  };

  const setCount = (n: number) => setClipCount(Math.min(10, Math.max(1, n)));

  const handleCut = async () => {
    if (!transcript.trim()) {
      textareaRef.current?.focus();
      return;
    }
    setState("loading");
    setClips([]);
    setErrorMsg("");

    try {
      const res = await fetch("/api/cut-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          clipCount,
          lengths: Array.from(selectedLengths),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        setState("error");
      } else {
        setClips(data.clips ?? []);
        setState("done");
      }
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  };

  const copyDescription = (idx: number) => {
    navigator.clipboard.writeText(clips[idx].description).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const regenerateClip = async (idx: number) => {
    if (regeneratingIdx !== null) return;
    setRegeneratingIdx(idx);
    try {
      const existingClips = clips
        .filter((_, i) => i !== idx)
        .map((c) => ({ title: c.title, excerpt: c.excerpt }));
      const res = await fetch("/api/cut-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          lengths: Array.from(selectedLengths),
          regenerate: true,
          existingClips,
        }),
      });
      const data = await res.json();
      if (data.clips?.length) {
        setClips((prev) => prev.map((c, i) => (i === idx ? (data.clips[0] as Clip) : c)));
        setAddedIdx((prev) => { const next = new Set(prev); next.delete(idx); return next; });
      }
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const addToReview = async (idx: number) => {
    if (addingIdx === idx || addedIdx.has(idx)) return;
    setAddingIdx(idx);
    const clip = clips[idx];
    const created = await createPost({
      title: clip.title,
      description: clip.description,
      notes: clip.excerpt,
      status: "Review",
      platforms: [],
      attachments: [],
    });
    setAddingIdx(null);
    if (created) {
      setAddedIdx((prev) => new Set([...prev, idx]));
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink transition-colors"
          >
            <ChevronLeft />
            Back to workspace
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Transcript
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 md:px-6">
        {/* Heading */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">Clip Studio</div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight leading-tight">
            Transcript Cutter
          </h1>
          <p className="mt-2 text-sm text-ink-soft max-w-lg">
            Paste a transcript and Claude finds the strongest standalone moments — verbatim, relevant, and ready to post.
          </p>
        </div>

        {/* Input card */}
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {/* Card header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <span className="text-sm font-semibold">Paste your transcript</span>
            <div className="flex gap-1.5 rounded-lg bg-surface-2 p-1">
              {LENGTH_OPTIONS.map((opt) => {
                const active = selectedLengths.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleLength(opt.value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/40"
                        : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the full transcript here. Speaker labels, timestamps, raw text — all fine. Claude reads the full context before deciding what to cut."
            className="min-h-[200px] w-full resize-y bg-transparent px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink placeholder:text-muted outline-none"
          />

          {/* Card footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-xs text-muted">
              {transcript.length.toLocaleString()} characters
            </span>
            <div className="flex items-center gap-3">
              {/* Clip count picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Cut into</span>
                <div className="flex items-center overflow-hidden rounded-lg border border-line bg-surface-2">
                  <button
                    onClick={() => setCount(clipCount - 1)}
                    disabled={clipCount <= 1}
                    className="flex h-8 w-8 items-center justify-center text-ink-soft hover:bg-line hover:text-ink disabled:opacity-30 transition-colors"
                  >
                    −
                  </button>
                  <span className="min-w-[24px] text-center text-sm font-bold tabular-nums">
                    {clipCount}
                  </span>
                  <button
                    onClick={() => setCount(clipCount + 1)}
                    disabled={clipCount >= 10}
                    className="flex h-8 w-8 items-center justify-center text-ink-soft hover:bg-line hover:text-ink disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>
                {/* Dot picker */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      title={`${n} clip${n > 1 ? "s" : ""}`}
                      className={`h-2 w-2 rounded-full transition-all ${
                        n <= clipCount
                          ? "scale-110 bg-accent"
                          : "bg-line hover:bg-line-strong"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted">clips</span>
              </div>

              <button
                onClick={handleCut}
                disabled={state === "loading" || !transcript.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-accent/90 hover:scale-[1.01] disabled:opacity-50 disabled:scale-100"
              >
                {state === "loading" ? (
                  <>
                    <SpinnerIcon />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <ScissorsIcon />
                    Cut clips
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {state === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Empty state */}
        {state === "idle" && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
            <ScissorsIconLg />
            <p className="text-sm">Your clips will appear here once you cut the transcript.</p>
          </div>
        )}

        {/* Results */}
        {state === "done" && clips.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {clips.length} Clip{clips.length > 1 ? "s" : ""} Found
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  Verbatim excerpts — no rewrites, ready to use
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                Done
              </span>
            </div>

            {clips.map((clip, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:border-line-strong"
              >
                {/* Clip header */}
                <div className="flex items-start gap-4 border-b border-line px-5 py-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-bold text-accent">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-snug">{clip.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span>{clip.estimatedDuration}</span>
                      {clip.score != null && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                          clip.score >= 8 ? "bg-emerald-500/10 text-emerald-600"
                          : clip.score >= 6 ? "bg-amber-500/10 text-amber-600"
                          : "bg-red-500/10 text-red-500"
                        }`}>
                          {clip.score}/10
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Clip body */}
                <div className="space-y-4 px-5 py-4">
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                      Transcript Excerpt
                    </div>
                    <div className="rounded-lg border-l-2 border-accent bg-surface-2 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-soft">
                      {clip.excerpt}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                      Post Description
                    </div>
                    <div className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                      {clip.description}
                    </div>
                  </div>

                  {clip.why && (
                    <div className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-muted italic">
                      Why this clip: {clip.why}
                    </div>
                  )}
                </div>

                {/* Clip footer */}
                <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                  <button
                    onClick={() => regenerateClip(i)}
                    disabled={regeneratingIdx !== null || addedIdx.has(i)}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                    title="Find a different clip from the transcript"
                  >
                    {regeneratingIdx === i ? <><SpinnerIcon /> Regenerating…</> : <><RefreshIcon /> Regenerate</>}
                  </button>
                  <button
                    onClick={() => copyDescription(i)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-2 hover:text-ink"
                  >
                    {copiedIdx === i ? "Copied!" : "Copy description"}
                  </button>
                  <button
                    onClick={() => addToReview(i)}
                    disabled={addingIdx === i || addedIdx.has(i)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      addedIdx.has(i)
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 cursor-default"
                        : "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
                    }`}
                  >
                    {addedIdx.has(i) ? (
                      <><CheckIcon /> Added to Review</>
                    ) : addingIdx === i ? (
                      <><SpinnerIcon /> Adding…</>
                    ) : (
                      <><PlusIcon /> Add to Review</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {state === "done" && clips.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center text-sm text-ink-soft">
            No strong clips found. Try a longer transcript or a different topic area.
          </div>
        )}
      </main>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  );
}

function ScissorsIconLg() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
