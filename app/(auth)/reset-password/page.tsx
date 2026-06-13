"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    // Supabase fires PASSWORD_RECOVERY when the recovery link is opened.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check if a session already exists (in case we mounted after the event).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div>
      <div className="mb-7">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted">New password</div>
        <h1 className="serif mt-2 text-4xl leading-tight">Set a new one.</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Choose something memorable. You&apos;ll be signed in straight after.
        </p>
      </div>

      {!ready ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm text-ink-soft">
            <div className="font-medium text-ink">Waiting for the reset link…</div>
            <div className="mt-1 text-xs">
              Open this page from the link in your email. If you&apos;re already here from the email and nothing happens, request a new link.
            </div>
          </div>
          <Link
            href="/forgot-password"
            className="block rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              className="auth-input"
              placeholder="At least 6 characters"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Confirm</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              className="auth-input"
              placeholder="Repeat the password"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-ink text-sm font-medium text-canvas shadow-card transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}

      <style>{`
        .auth-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--surface);
          padding: 10px 12px;
          font-size: 14px;
          color: var(--ink);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .auth-input::placeholder { color: var(--muted); }
        .auth-input:focus {
          border-color: var(--line-strong);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      `}</style>
    </div>
  );
}
