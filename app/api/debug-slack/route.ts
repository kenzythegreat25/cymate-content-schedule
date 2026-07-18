import { NextResponse } from "next/server";

const SLACK_TOKEN  = process.env.SLACK_TOKEN ?? "";
const WINS_CHANNEL = "C07GM6BHVMG";

export async function GET() {
  if (!SLACK_TOKEN) {
    return NextResponse.json({ error: "SLACK_TOKEN env var not set" }, { status: 500 });
  }

  // Test auth
  const authRes = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  const auth = await authRes.json();
  if (!auth.ok) {
    return NextResponse.json({ error: "auth.test failed", detail: auth.error }, { status: 500 });
  }

  // Test channel read
  const oldest = Math.floor(new Date("2025-04-01T00:00:00Z").getTime() / 1000).toString();
  const histRes = await fetch(
    `https://slack.com/api/conversations.history?channel=${WINS_CHANNEL}&oldest=${oldest}&limit=5`,
    { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
  );
  const hist = await histRes.json();

  return NextResponse.json({
    auth: { user: auth.user, team: auth.team },
    channel_read: hist.ok,
    channel_error: hist.error ?? null,
    scopes_needed: ["channels:history", "files:read"],
    sample_messages: hist.ok
      ? (hist.messages ?? []).slice(0, 3).map((m: { text?: string; ts?: string; files?: { id?: string; mimetype?: string; permalink?: string; url_private?: string }[] }) => ({
          ts: m.ts,
          text: (m.text ?? "").slice(0, 80),
          files: (m.files ?? []).map((f) => ({ id: f.id, mimetype: f.mimetype, permalink: f.permalink, url_private: f.url_private })),
        }))
      : [],
  });
}
