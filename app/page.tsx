import Link from "next/link";
import { ThemeChip } from "./(auth)/ThemeChip";
import LightRays from "../components/LightRays";

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Nav />
      <Hero />
      <Pillars />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ─── Nav ─── */

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-canvas">
            <LogoMark />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Cymate</div>
            <div className="text-[10px] text-muted">Content Studio</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeChip />
          <Link href="/login" className="hidden text-sm text-ink-soft hover:text-ink sm:block">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-ink px-3.5 py-1.5 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.02]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ─── Hero ─── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* LightRays WebGL background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <LightRays
          raysOrigin="top-center"
          raysColor="#00e6ff"
          raysSpeed={0.4}
          lightSpread={1}
          rayLength={1.5}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0.1}
          distortion={0.05}
          fadeDistance={0.8}
          saturation={1.3}
        />
      </div>
      {/* Keep the soft blur blobs for light-mode fallback warmth */}
      <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
      <div className="absolute -right-20 top-40 h-72 w-72 rounded-full bg-[#00e6ff]/20 blur-3xl" />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-24">
        <div className="lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-2.5 py-1 text-[11px] text-ink-soft backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            New — three-view workspace
          </div>
          <h1 className="serif mt-5 text-5xl leading-[1.02] tracking-tight md:text-6xl">
            The calmer way to plan <em className="text-accent">what you post.</em>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">
            Board, calendar, and list — three views over the same workspace. From raw idea to performance recap, in one place. Built for solo creators and small teams who treat content like product.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.02]"
            >
              Start free →
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-soft hover:border-line-strong hover:text-ink"
            >
              I already have an account
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted">
            <CheckSmall /> Free forever for solo use
            <span className="text-line-strong">·</span>
            <CheckSmall /> No credit card
            <span className="text-line-strong">·</span>
            <CheckSmall /> Light + dark
          </div>
        </div>

        <div className="lg:col-span-6">
          <MockBoard />
        </div>
      </div>
    </section>
  );
}

function MockBoard() {
  return (
    <div className="cs-demo">
      <div className="cs-board">
        <div className="cs-col">
          <div className="cs-colhead"><span className="cs-dot cs-idea" /><span>Idea</span><span className="cs-count">2</span></div>
          <div className="cs-static"><div className="cs-static-title">Behind the build</div>Process video.</div>
          <div className="cs-static"><div className="cs-static-title">Hot take</div>Meeting culture.</div>
        </div>
        <div className="cs-col">
          <div className="cs-colhead"><span className="cs-dot cs-review" /><span>Review</span><span className="cs-count">1</span></div>
          <div className="cs-static"><div className="cs-static-title">Founder Q&amp;A</div>Carousel of 8.</div>
        </div>
        <div className="cs-col">
          <div className="cs-colhead"><span className="cs-dot cs-scheduled" /><span>Scheduled</span><span className="cs-count">1</span></div>
          <div className="cs-static"><div className="cs-static-title">Customer story</div>3× faster.</div>
        </div>
        <div className="cs-col">
          <div className="cs-colhead"><span className="cs-dot cs-posted" /><span>Posted</span><span className="cs-count">1</span></div>
          <div className="cs-static"><div className="cs-static-title">Launch teaser</div><span className="cs-pill cs-perf">8.2k views</span></div>
        </div>

        <div className="cs-hero">
          <div className="cs-hero-date">Jun 22</div>
          <div className="cs-status-track">
            <span className="cs-status-pill cs-s-idea">● Idea</span>
            <span className="cs-status-pill cs-s-review">● Review</span>
            <span className="cs-status-pill cs-s-scheduled">● Scheduled</span>
            <span className="cs-status-pill cs-s-posted">● Posted</span>
          </div>
          <div className="cs-hero-title">Q3 product reveal</div>
          <div className="cs-hero-desc">60-sec cinematic cut.</div>
          <div className="cs-platforms">
            <span className="cs-p cs-p-li">in</span>
            <span className="cs-p cs-p-ig">●</span>
            <span className="cs-p cs-p-yt">▶</span>
            <span className="cs-attach">+3</span>
          </div>
          <div className="cs-review-row">
            <span className="cs-pill cs-approved-chip">✓ Approved</span>
            <span className="cs-pill cs-perf cs-perf-chip">12.4k views</span>
          </div>
        </div>
      </div>

      <div className="cs-spots">
        <div className="cs-spot cs-spot-1">
          <div className="cs-spot-label">Media</div>
          <div className="cs-spot-title">Drop 1, drop 10</div>
          <div className="cs-media-row">
            <div className="cs-media-tile cs-img-a" />
            <div className="cs-media-tile cs-img-b" />
            <div className="cs-media-tile cs-vid">▶</div>
          </div>
        </div>
        <div className="cs-spot cs-spot-2">
          <div className="cs-spot-label">Review</div>
          <div className="cs-spot-title">One-click approve</div>
          <span className="cs-pill-aw">● Awaiting</span>
          <div className="cs-review-spot">
            <span className="cs-spot-btn cs-btn-approve">✓ Approve</span>
            <span className="cs-spot-btn cs-btn-rev">↺ Revise</span>
          </div>
        </div>
        <div className="cs-spot cs-spot-3">
          <div className="cs-spot-label">Reminders</div>
          <div className="cs-spot-title">Email the day before</div>
          <div className="cs-email">
            <div className="cs-email-from"><span>Content Studio</span><span>now</span></div>
            <div className="cs-email-sub">Posting tomorrow ✦ Q3 reveal</div>
          </div>
        </div>
        <div className="cs-spot cs-spot-4">
          <div className="cs-spot-label">Export</div>
          <div className="cs-spot-title">CSV any time</div>
          <div className="cs-csv-row">
            <div className="cs-csv-icon">CSV</div>
            <div>
              <div className="cs-csv-name">content_schedule.csv</div>
              <div className="cs-csv-meta">42 rows · download</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cs-demo {
          position: relative;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: var(--surface);
          padding: 18px 16px 16px;
          box-shadow: 0 1px 2px rgba(26,22,20,0.04), 0 12px 32px rgba(26,22,20,0.06);
        }
        .cs-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; position: relative; min-height: 220px; }
        .cs-col { background: var(--surface-2); border: 0.5px solid var(--line); border-radius: 10px; padding: 6px; min-height: 220px; }
        .cs-colhead { display: flex; align-items: center; gap: 5px; margin-bottom: 6px; padding-left: 2px; font-size: 9px; font-weight: 500; color: var(--ink); }
        .cs-colhead .cs-count { color: var(--muted); font-weight: 400; margin-left: auto; }
        .cs-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
        .cs-idea { background: #8b5cf6; }
        .cs-review { background: var(--accent); }
        .cs-scheduled { background: #0ea5e9; }
        .cs-posted { background: #10b981; }
        .cs-static { background: var(--surface); border: 0.5px solid var(--line); border-radius: 7px; padding: 5px 7px; font-size: 9px; line-height: 1.3; margin-bottom: 5px; color: var(--ink-soft); }
        .cs-static-title { color: var(--ink); font-weight: 500; font-size: 9px; margin-bottom: 2px; }
        .cs-pill { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border-radius: 999px; font-size: 8px; line-height: 1.4; }
        .cs-perf { background: rgba(16,185,129,0.12); color: #065f46; font-weight: 500; }
        .cs-approved-chip { background: rgba(16,185,129,0.12); color: #065f46; opacity: 0; animation: csApprove 16s linear infinite; }
        .cs-perf-chip { opacity: 0; animation: csPerf 16s linear infinite; }

        .cs-hero {
          position: absolute; width: calc(25% - 14px); left: 7px; top: 22px;
          background: var(--surface); border: 0.5px solid var(--line-strong);
          border-radius: 8px; padding: 6px 7px 7px;
          box-shadow: 0 3px 10px rgba(26,22,20,0.10);
          animation: csTravel 16s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .cs-hero-date { font-size: 8px; color: var(--muted); margin-bottom: 2px; }
        .cs-hero-title { font-size: 10px; font-weight: 500; color: var(--ink); line-height: 1.2; margin-bottom: 3px; }
        .cs-hero-desc { font-size: 8px; color: var(--ink-soft); line-height: 1.3; margin-bottom: 4px; }
        .cs-platforms { display: flex; gap: 3px; align-items: center; margin-bottom: 3px; }
        .cs-platforms .cs-p { width: 12px; height: 12px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 500; }
        .cs-p-li { background: #e8f1fb; color: #0a66c2; }
        .cs-p-ig { background: #fde7f3; color: #d6249f; }
        .cs-p-yt { background: #fde6e6; color: #cc0000; }
        .cs-attach { background: rgba(26,22,20,0.08); color: var(--ink-soft); font-size: 7px; padding: 1px 4px; border-radius: 999px; margin-left: auto; }
        .cs-review-row { display: flex; justify-content: space-between; align-items: center; gap: 4px; }

        .cs-status-track { position: relative; height: 12px; margin-bottom: 3px; }
        .cs-status-pill { position: absolute; padding: 1px 5px; border-radius: 999px; font-size: 7px; line-height: 1.5; font-weight: 500; }
        .cs-s-idea     { background: #ede9fe;            color: #5b21b6; animation: csShow1 16s linear infinite; }
        .cs-s-review   { background: rgba(253,94,2,0.12); color: #b3420a; animation: csShow2 16s linear infinite; }
        .cs-s-scheduled{ background: #e0f2fe;            color: #075985; animation: csShow3 16s linear infinite; }
        .cs-s-posted   { background: #d1fae5;            color: #065f46; animation: csShow4 16s linear infinite; }

        @keyframes csTravel {
          0%, 4% { transform: translate(0%, 0); }
          14%, 24% { transform: translate(100%, 0); }
          34%, 44% { transform: translate(200%, 0); }
          54%, 92% { transform: translate(300%, 0); }
          98%, 100% { transform: translate(300%, 0); opacity: 0; }
        }
        @keyframes csApprove { 0%, 24% { opacity: 0; transform: scale(0.85); } 34%, 92% { opacity: 1; transform: scale(1); } 98%, 100% { opacity: 0; } }
        @keyframes csPerf    { 0%, 54% { opacity: 0; transform: scale(0.85); } 62%, 92% { opacity: 1; transform: scale(1); } 98%, 100% { opacity: 0; } }
        @keyframes csShow1 { 0%, 4% { opacity: 1; } 4.01%, 100% { opacity: 0; } }
        @keyframes csShow2 { 0%, 4% { opacity: 0; } 4.01%, 24% { opacity: 1; } 24.01%, 100% { opacity: 0; } }
        @keyframes csShow3 { 0%, 24% { opacity: 0; } 24.01%, 44% { opacity: 1; } 44.01%, 100% { opacity: 0; } }
        @keyframes csShow4 { 0%, 44% { opacity: 0; } 44.01%, 92% { opacity: 1; } 92.01%, 100% { opacity: 0; } }

        .cs-spots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
        .cs-spot { background: var(--surface); border: 0.5px solid var(--line); border-radius: 10px; padding: 8px 9px; min-height: 96px; display: flex; flex-direction: column; gap: 5px; transition: transform 0.4s, border-color 0.4s, box-shadow 0.4s; opacity: 0.55; }
        .cs-spot-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 500; }
        .cs-spot-title { font-size: 10px; font-weight: 500; color: var(--ink); line-height: 1.2; }
        .cs-spot-1 { animation: csSpot 16s linear infinite; animation-delay: 0s; }
        .cs-spot-2 { animation: csSpot 16s linear infinite; animation-delay: -12s; }
        .cs-spot-3 { animation: csSpot 16s linear infinite; animation-delay: -8s; }
        .cs-spot-4 { animation: csSpot 16s linear infinite; animation-delay: -4s; }
        @keyframes csSpot {
          0%, 18%   { opacity: 1; transform: scale(1.02); border-color: var(--accent); box-shadow: 0 4px 14px rgba(253,94,2,0.18); }
          25%, 100% { opacity: 0.55; transform: scale(1); border-color: var(--line); box-shadow: none; }
        }

        .cs-media-row { display: flex; gap: 3px; }
        .cs-media-tile { flex: 1; aspect-ratio: 1; border-radius: 4px; border: 0.5px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--canvas); font-size: 9px; }
        .cs-img-a { background: linear-gradient(135deg, #fbe4d2, #f4c0d1); }
        .cs-img-b { background: linear-gradient(135deg, #d6efff, #e0d8ff); }
        .cs-vid   { background: var(--ink); }

        .cs-pill-aw { background: rgba(253,94,2,0.12); color: #b3420a; font-size: 7px; padding: 1px 5px; border-radius: 999px; display: inline-block; align-self: flex-start; }
        .cs-review-spot { display: flex; gap: 3px; align-items: center; }
        .cs-spot-btn { font-size: 7px; padding: 2px 5px; border-radius: 4px; font-weight: 500; }
        .cs-btn-approve { background: #059669; color: #fff; }
        .cs-btn-rev { background: #fee2e2; color: #991b1b; border: 0.5px solid #fecaca; }

        .cs-email { background: var(--surface-2); border-radius: 5px; padding: 5px 6px; font-size: 8px; color: var(--ink-soft); border: 0.5px solid var(--line); }
        .cs-email-from { display: flex; justify-content: space-between; }
        .cs-email-sub { color: var(--ink); font-weight: 500; font-size: 8px; margin-top: 1px; }

        .cs-csv-row { display: flex; align-items: center; gap: 5px; padding: 4px 5px; background: var(--surface-2); border: 0.5px solid var(--line); border-radius: 5px; font-size: 8px; }
        .cs-csv-icon { width: 18px; height: 18px; border-radius: 3px; background: #d1fae5; color: #065f46; font-size: 7px; font-weight: 500; display: flex; align-items: center; justify-content: center; }
        .cs-csv-name { color: var(--ink); font-weight: 500; font-size: 9px; }
        .cs-csv-meta { color: var(--muted); font-size: 8px; }
      `}</style>
    </div>
  );
}

/* ─── Pillars ─── */

function Pillars() {
  return (
    <section className="border-y border-line bg-surface-2/40 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Three views, one workspace</div>
          <h2 className="serif mt-3 text-4xl tracking-tight md:text-5xl">
            Same data. Three angles.
          </h2>
          <p className="mt-3 text-ink-soft">
            Move ideas across stages on a Kanban board. Drop them onto a calendar to see your week. Read them as a list when you need detail. Always the same source of truth.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Pillar
            icon={<BoardIcon />}
            title="Board"
            body="Drag ideas through Idea → Drafting → Scheduled → Posted. The pipeline at a glance."
          />
          <Pillar
            icon={<CalendarIcon />}
            title="Calendar"
            body="Stacked monthly view, color-coded by status. Plan your week without leaving the app."
          />
          <Pillar
            icon={<ListIcon />}
            title="List"
            body="Sortable table when you need to scan, filter, or read the details all at once."
          />
        </div>
      </div>
    </section>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-lg">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

/* ─── How it works ─── */

function HowItWorks() {
  const steps = [
    { n: "01", title: "Capture", body: "Drop in every idea the moment it lands. No fields required to start." },
    { n: "02", title: "Shape", body: "Add a caption, on-screen text, platforms, and date as the idea takes form." },
    { n: "03", title: "Recap", body: "After publishing, log what worked. Build an honest map of your content over time." },
  ];
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Workflow</div>
            <h2 className="serif mt-3 text-4xl tracking-tight md:text-5xl">From idea to recap.</h2>
          </div>
          <p className="hidden max-w-sm text-sm text-ink-soft md:block">
            The point isn&apos;t a fancier spreadsheet. It&apos;s closing the loop between what you planned and what actually shipped.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line bg-surface p-7 shadow-card">
              <div className="serif text-3xl text-accent">{s.n}</div>
              <div className="mt-4 text-lg font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─── */

function FinalCTA() {
  return (
    <section className="px-6 pb-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-ink p-12 text-canvas shadow-card-lg md:p-16">
        <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -right-12 bottom-0 h-72 w-72 rounded-full bg-[#00e6ff]/20 blur-3xl" />
        <div className="relative grid items-end gap-8 md:grid-cols-12">
          <div className="md:col-span-7">
            <h2 className="serif text-4xl leading-tight tracking-tight md:text-5xl">
              Your next post deserves <em>a calmer plan.</em>
            </h2>
            <p className="mt-4 max-w-lg text-canvas/70">
              Free forever for solo use. Sign up in seconds — no credit card, no calendar invites.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-5 md:justify-end">
            <Link
              href="/signup"
              className="rounded-lg bg-canvas px-4 py-2.5 text-sm font-medium text-ink shadow-card transition-transform hover:scale-[1.02]"
            >
              Start free →
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-canvas/20 px-4 py-2.5 text-sm text-canvas/80 hover:border-canvas/40 hover:text-canvas"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */

function Footer() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-muted">
        <div>© {new Date().getFullYear()} Cymate · Content Studio</div>
        <div className="flex gap-4">
          <a
            href="https://github.com/kenzythegreat25/cymate-content-schedule"
            className="hover:text-ink"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link href="/login" className="hover:text-ink">Sign in</Link>
          <Link href="/signup" className="hover:text-ink">Sign up</Link>
        </div>
      </div>
    </footer>
  );
}

/* ─── Icons ─── */

function LogoMark() {
  return (
    <span className="text-[11px] font-semibold tracking-tight">CS</span>
  );
}
function CheckSmall() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  );
}
function BoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="18" rx="1"/><rect x="11" y="3" width="6" height="12" rx="1"/><rect x="19" y="3" width="2" height="8" rx="1"/></svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  );
}
function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
  );
}
