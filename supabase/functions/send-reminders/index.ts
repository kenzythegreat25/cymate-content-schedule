// Cymate Content Studio · daily reminder Edge Function
// Sends one email per user with the posts due to publish tomorrow.
// Triggered by pg_cron (see supabase/cron-reminders.sql).
//
// Required Supabase secrets (set via dashboard → Functions → Secrets, or
// `supabase secrets set RESEND_API_KEY=… FROM_EMAIL=… APP_URL=…`):
//   RESEND_API_KEY  — from resend.com
//   FROM_EMAIL      — e.g. "Content Studio <hello@yourdomain.com>"; for testing
//                     "onboarding@resend.dev" works without verifying a domain
//   APP_URL         — https://content-schedule-studio.vercel.app
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are injected by Supabase.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Post = {
  id: string;
  title: string | null;
  user_id: string;
  date: string;
  status: string;
  platforms: string[] | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Content Studio <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://content-schedule-studio.vercel.app";

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    return json({ error: "RESEND_API_KEY is not set" }, 500);
  }

  const tomorrow = isoDate(addDays(new Date(), 1));

  // Fetch posts due tomorrow that are scheduled or drafting
  const postsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?date=eq.${tomorrow}&status=in.(Scheduled,Drafting)&select=id,title,user_id,date,status,platforms`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!postsRes.ok) return json({ error: "Failed to query posts", status: postsRes.status }, 500);
  const posts = (await postsRes.json()) as Post[];

  const byUser = new Map<string, Post[]>();
  for (const p of posts) {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
    byUser.get(p.user_id)!.push(p);
  }

  let sent = 0;
  let failed = 0;
  for (const [userId, items] of byUser) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!userRes.ok) { failed++; continue; }
    const { email } = await userRes.json();
    if (!email) { failed++; continue; }

    const subject = items.length === 1
      ? `Reminder: ${items[0].title || "Untitled"} posts tomorrow`
      : `${items.length} posts scheduled for tomorrow`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject,
        html: renderEmail(items, tomorrow),
      }),
    });
    if (r.ok) sent++; else failed++;
  }

  return json({ tomorrow, postCount: posts.length, userCount: byUser.size, sent, failed });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderEmail(items: Post[], date: string) {
  const formatted = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const rows = items.map((i) => {
    const title = esc(i.title || "Untitled");
    const platforms = (i.platforms || []).map(esc).join(" · ") || "No channels";
    return `
      <tr><td style="padding:14px 18px;border-bottom:1px solid #ece8df;">
        <div style="font-weight:600;color:#1a1614;font-size:15px;">${title}</div>
        <div style="margin-top:4px;font-size:12px;color:#8a827a;">${platforms} · ${esc(i.status)}</div>
      </td></tr>`;
  }).join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1614;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="margin-bottom:28px;display:flex;align-items:center;gap:10px;">
      <div style="display:inline-block;width:36px;height:36px;border-radius:8px;background:#1a1614;color:#f7f5f0;text-align:center;line-height:36px;font-weight:700;font-size:13px;letter-spacing:-1px;">CS</div>
      <div style="line-height:1.1;">
        <div style="font-weight:600;font-size:14px;">Cymate</div>
        <div style="font-size:11px;color:#8a827a;">Content Studio</div>
      </div>
    </div>
    <div style="color:#8a827a;font-size:11px;letter-spacing:2px;text-transform:uppercase;">${formatted}</div>
    <h1 style="font-family:Georgia,'Iowan Old Style',serif;font-size:32px;line-height:1.1;letter-spacing:-0.5px;margin:8px 0 8px;">Posting tomorrow</h1>
    <p style="margin:0 0 24px;color:#5b534d;font-size:15px;line-height:1.5;">
      ${items.length === 1 ? "Heads up — one post is scheduled to ship tomorrow." : `Heads up — ${items.length} posts are scheduled to ship tomorrow.`}
    </p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #ece8df;border-radius:12px;overflow:hidden;">
      ${rows}
    </table>
    <p style="margin:28px 0 0;text-align:center;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1a1614;color:#f7f5f0;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">Open workspace →</a>
    </p>
    <p style="margin:40px 0 0;text-align:center;color:#a8a29e;font-size:11px;">
      You're getting this because you have posts scheduled in Content Studio.<br/>
      <a href="${APP_URL}/settings" style="color:#a8a29e;">Manage preferences</a>
    </p>
  </div>
</body></html>`;
}
