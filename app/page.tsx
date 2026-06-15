import Link from "next/link";
import { ThemeChip } from "./(auth)/ThemeChip";

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
      <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
      <div className="absolute -right-20 top-40 h-72 w-72 rounded-full bg-[#00e6ff]/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-24">
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
    <div className="relative">
      <div className="absolute inset-0 -rotate-2 rounded-2xl bg-accent/5" />
      <div className="relative grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card-lg">
        <MockColumn dot="bg-amber-500" label="Drafting" count={2}>
          <MockCard title="Founder Q&A — bootstrap edition" date="Jun 16" badges={["LI", "IG"]} />
          <MockCard title="Hot take: meeting culture" date="Jun 14" badges={["X", "LI"]} />
        </MockColumn>
        <MockColumn dot="bg-sky-500" label="Scheduled" count={1}>
          <MockCard title="Q3 product reveal teaser" date="Jun 13" badges={["LI", "IG", "YT"]} highlight />
        </MockColumn>
        <MockColumn dot="bg-emerald-500" label="Posted" count={1}>
          <MockCard title="Customer story: Aviary Labs" date="Jun 9" badges={["LI", "YT"]} perf="12.4k views" />
        </MockColumn>
        <MockColumn dot="bg-violet-500" label="Idea" count={1}>
          <MockCard title="Behind the build: design system" date="Jun 19" badges={["YT", "TT"]} />
        </MockColumn>
      </div>
    </div>
  );
}

function MockColumn({ dot, label, count, children }: { dot: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] font-medium">{label}</span>
        <span className="text-[10px] text-muted">{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function MockCard({ title, date, badges, perf, highlight }: { title: string; date: string; badges: string[]; perf?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border bg-surface p-2 shadow-card transition ${highlight ? "border-accent/40 ring-2 ring-accent/10" : "border-line"}`}>
      <div className="flex items-center justify-between text-[9px] text-muted">
        <span>📅 {date}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug">{title}</div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex -space-x-1">
          {badges.map((b, i) => (
            <span key={i} className="flex h-4 w-4 items-center justify-center rounded-full bg-line text-[8px] font-semibold text-ink ring-2 ring-surface">
              {b}
            </span>
          ))}
        </div>
        {perf && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
            {perf}
          </span>
        )}
      </div>
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
