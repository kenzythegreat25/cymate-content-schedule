"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div>
      <div className="mb-7">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted">Reset password</div>
        <h1 className="serif mt-2 text-4xl leading-tight">Forgot it? Happens.</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            <div className="font-medium">Check your inbox</div>
            <div className="mt-1 text-xs text-emerald-700">
              We sent a reset link to <span className="font-medium">{email}</span>. Click it to set a new password. It may take a minute to arrive.
            </div>
          </div>
          <Link
            href="/login"
            className="block rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="auth-input"
              placeholder="you@company.com"
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
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <div className="text-center text-sm">
            <Link href="/login" className="text-ink-soft hover:text-ink">
              ← Back to sign in
            </Link>
          </div>
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
