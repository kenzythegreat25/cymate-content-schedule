"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase/client";
import { useTheme, type Theme } from "../../lib/theme";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [joinedAt, setJoinedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setEmail(data.user.email ?? "");
        setJoinedAt(data.user.created_at);
      }
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <ChevronLeft /> Back to workspace
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-ink-soft hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 md:px-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">Settings</div>
          <h1 className="serif mt-2 text-4xl leading-tight tracking-tight">Your account.</h1>
        </div>

        <Section title="Account" subtitle="Read-only info from your sign-up.">
          <Row label="Email" value={email} />
          <Row label="Member since" value={joinedAt ? new Date(joinedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"} />
          <ExportRow />
        </Section>

        <Section title="Theme" subtitle="Pick how the app looks.">
          <ThemeRow />
        </Section>

        <Section title="Change password" subtitle="Set a new one — you'll stay signed in.">
          <ChangePasswordForm />
        </Section>

        <Section title="Danger zone" subtitle="Permanent. No undo." danger>
          <DeleteAccountForm email={email} onDeleted={() => router.push("/")} />
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  danger,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-surface shadow-card ${danger ? "border-red-200" : "border-line"}`}>
      <div className={`border-b px-5 py-4 ${danger ? "border-red-100 bg-red-50/40" : "border-line bg-surface-2/40"}`}>
        <div className={`text-sm font-semibold ${danger ? "text-red-700" : "text-ink"}`}>{title}</div>
        {subtitle && <div className={`mt-0.5 text-xs ${danger ? "text-red-600/80" : "text-ink-soft"}`}>{subtitle}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-b-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function csvCell(v: unknown) {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ExportRow() {
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const onExport = async () => {
    setBusy(true);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: true });
    setBusy(false);
    if (error || !data) {
      alert("Export failed. Please try again.");
      return;
    }
    setCount(data.length);

    const headers = [
      "id",
      "title",
      "date",
      "on_screen_text",
      "description",
      "platforms",
      "status",
      "content_type",
      "attachments",
      "performance_score",
      "notes",
      "created_at",
    ];
    const rows = data.map((r: Record<string, unknown>) =>
      headers.map((h) => csvCell(r[h])).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `content-schedule-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-b-0">
      <div>
        <div className="text-sm text-ink-soft">Your data</div>
        {count !== null && (
          <div className="mt-0.5 text-[11px] text-muted">{count} {count === 1 ? "post" : "posts"} exported</div>
        )}
      </div>
      <button
        onClick={onExport}
        disabled={busy}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:border-line-strong hover:text-ink disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Download CSV"}
      </button>
    </div>
  );
}

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const opts: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
      {opts.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            className={`flex flex-1 items-center justify-center rounded px-3 py-1.5 text-sm transition ${active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChangePasswordForm() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (pw.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOk(true);
    setPw("");
    setConfirm("");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="New password (6+ characters)"
        autoComplete="new-password"
        className="settings-input"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        autoComplete="new-password"
        className="settings-input"
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Password updated.</div>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !pw}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {loading ? "Saving…" : "Update password"}
        </button>
      </div>
      <style>{`
        .settings-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--surface);
          padding: 9px 12px;
          font-size: 14px;
          color: var(--ink);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .settings-input::placeholder { color: var(--muted); }
        .settings-input:focus {
          border-color: var(--line-strong);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      `}</style>
    </form>
  );
}

function DeleteAccountForm({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const armed = confirmText === email;

  const onDelete = async () => {
    if (!armed) return;
    if (!confirm("Permanently delete your account and all posts? This cannot be undone.")) return;
    setError(null);
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc("delete_current_user");
    if (error) {
      setLoading(false);
      setError(
        error.message.includes("function") || error.code === "PGRST202"
          ? "Delete function missing. Run the delete-account SQL from supabase/delete-account.sql in your Supabase project."
          : error.message
      );
      return;
    }
    await supabase.auth.signOut();
    onDeleted();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Deletes your sign-in and every post you&apos;ve created. Uploaded images stay in storage but become orphans.
        Type <span className="font-mono text-ink">{email}</span> below to confirm.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={email}
        className="settings-input"
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="flex justify-end">
        <button
          onClick={onDelete}
          disabled={!armed || loading}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-card transition-transform hover:scale-[1.01] disabled:opacity-50"
        >
          {loading ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  );
}
