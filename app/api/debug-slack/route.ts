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
  const histRes = await fetch(
    `https://slack.com/api/conversations.history?channel=${WINS_CHANNEL}&limit=20`,
    { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
  );
  const hist = await histRes.json();

  type SlackFile = { id?: string; mimetype?: string; permalink?: string; url_private?: string };
  type SlackMsg = { text?: string; ts?: string; files?: SlackFile[] };

  const realMessages = hist.ok
    ? (hist.messages as SlackMsg[]).filter((m) =>
        m.text &&
        !m.text.includes("has joined") &&
        !m.text.includes("has renamed") &&
        m.text.length > 20
      ).slice(0, 5)
    : [];

  return NextResponse.json({
    auth: { user: auth.user, team: auth.team },
    channel_read: hist.ok,
    channel_error: hist.error ?? null,
    sample_wins: realMessages.map((m) => ({
      ts: m.ts,
      slack_link: `https://cymate.slack.com/archives/${WINS_CHANNEL}/p${(m.ts ?? "").replace(".", "")}`,
      text: (m.text ?? "").slice(0, 120),
      files: (m.files ?? []).map((f) => ({
        id: f.id,
        mimetype: f.mimetype,
        permalink: f.permalink ?? null,
        url_private: f.url_private ?? null,
      })),
    })),
  });
}
