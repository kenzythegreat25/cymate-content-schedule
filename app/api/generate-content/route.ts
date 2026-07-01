import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const ALLOWED_EMAIL = "kenc@cymate.io";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Sunday 10 AM PH = Sunday 02:00 UTC → cron "0 2 * * 0"

function getWeekDates(): Record<string, string> {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + daysUntilMon);
  mon.setUTCHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const add = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() + n); return x; };
  return {
    mon: fmt(mon),
    tue: fmt(add(mon, 1)),
    wed: fmt(add(mon, 2)),
    thu: fmt(add(mon, 3)),
    fri: fmt(add(mon, 4)),
  };
}

async function callClaude(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // 25s per call
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`Claude API ${res.status}: ${err}`);
    }
    const data = await res.json() as { content: { text: string }[] };
    return data.content[0].text;
  } finally {
    clearTimeout(timer);
  }
}

const IG_HASHTAG_POOL = `
Pick exactly 5 hashtags from the best mix of these for the specific post topic. Prioritize engagement and searchability by B2B founders, sales leaders, and GTM teams:
#B2BOutbound #ColdEmail #LeadGeneration #OutboundSales #GTMStrategy #SalesProspecting #B2BSales #SalesDevelopment #RevenueGrowth #EmailOutreach #OutboundMarketing #B2BMarketing #SalesStrategy #PipelineGeneration #BookMoreMeetings #SDR #SalesLeadership #StartupGrowth #GrowthStrategy #DemandGeneration #SalesTips #B2BGrowth #OutboundAgency #ColdEmailTips #SalesAutomation
Place the 5 hashtags on their own line at the end of the caption, separated by a blank line.
`.trim();

const BASE_INSTRUCTIONS = `
Cymate is a B2B outbound cold email agency. They run cold email campaigns for tech/SaaS companies — lead prospecting, ICP building, deliverability, reply management. GTM Engineers (not junior SDRs). Performance-based pricing.

TONE: Human, first-person (we/our team/I), conversational, no corporate jargon, no em dashes (—), no emojis, short varied sentences. Never hard-sell. Let the value speak. Posts feel like a knowledgeable peer sharing something useful, not a brand pitching a service.

HOOK RULE: Every post must open with a strong hook — one line that stops the scroll. Challenge an assumption, share a surprising outcome, or say something counterintuitive. The hook is the most important line.

IG CTAs: Soft, natural. "Link in bio" style. Save comment-to-unlock only for high-value giveaways.
LinkedIn CTAs: Soft and contextual. "visit cymate.io" or "link in the comments" for long URLs. Never "DM us."

AVOID: Copybara case study, Prosal case study, cold email is dead, $100M stat, 150+ companies stat, Instagram intro post, IGNITE competition.

Return ONLY a valid JSON array. No markdown, no explanation.

TITLE RULE: Short, topic-only. No day names ever.

Each object:
{
  "platform": "Instagram" | "LinkedIn",
  "date": "YYYY-MM-DD",
  "title": "short topic-only title",
  "on_screen_text": "Instagram: always a short punchy hook (3-10 words) that goes on the poster graphic. LinkedIn text posts: empty string. Carousels: first slide hook only.",
  "description": "Instagram: hook line + 3-4 lines of value + CTA + blank line + 5 hashtags (see hashtag rules). For carousels: a clean 2-4 line summary caption of what the carousel covers — make it compelling enough to swipe, not a slide list. LinkedIn: 280-380 words, hook first line, story-driven, soft CTA at end. NO hashtags on LinkedIn.",
  "slides": ["slide 1 text", "slide 2 text", ...] — Carousel posts only, 5-6 slides, each is the full text for that frame. Omit for all other post types.,
  "content_type": "Static" | "Carousel" | "Text" | "Reel",
  "notes": "designer direction: always a clean graphic/poster for IG (no people in background needed), mood and style, reel script beats if Reel"
}
`.trim();

// Skip the July 5 2026 cron run — content generated manually Jul 2
const SKIP_DATES = new Set(["2026-07-05"]);

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const todayUTC = new Date().toISOString().slice(0, 10);
  if (SKIP_DATES.has(todayUTC)) {
    return NextResponse.json({ skipped: true, date: todayUTC });
  }
  // For cron: look up user via posts table (avoids slow listUsers)
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: postRow } = await supabaseAdmin.from("posts").select("user_id").limit(1).single();
  if (!postRow?.user_id) return NextResponse.json({ error: "Could not resolve user" }, { status: 500 });
  return runGeneration(postRow.user_id);
}

export async function POST(req: Request) {
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
  if (!user || user.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // user.id is already known — pass it directly, no listUsers needed
  return runGeneration(user.id);
}

type PostDraft = {
  platform: string;
  date: string;
  title: string;
  on_screen_text: string;
  description: string;
  slides?: string[];
  content_type: string;
  notes: string;
};

function parseJson(raw: string): PostDraft[] {
  const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function runGeneration(userId: string): Promise<Response> {
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  if (!SERVICE_KEY)   return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const dates = getWeekDates();

  const isoWeek = Math.ceil((new Date(dates.mon).getDate() + new Date(new Date(dates.mon).getFullYear(), 0, 1).getDay()) / 7);
  const includeReel = isoWeek % 2 === 1;

  const scheduleCtx = `
Dates: Mon=${dates.mon} Tue=${dates.tue} Wed=${dates.wed} Thu=${dates.thu} Fri=${dates.fri}
Tuesday IG: Carousel (5-6 slides)
Thursday IG: ${includeReel ? "Reel (45-60s — include beat-by-beat script in notes)" : "Static graphic poster"}
LinkedIn Friday: detailed case study (fictional client, fresh industry, specific metrics, one thing that went wrong)
All IG posts: clean graphic/poster, no people in background needed. on_screen_text is always a short hook visible on the poster.
`.trim();

  const igPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}

${scheduleCtx}

Generate exactly 5 Instagram posts (one per weekday Mon-Fri). Each post must end with 5 hashtags relevant to that specific post's topic (see hashtag rules above). Return a JSON array of 5 objects.`;

  const liPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}

${scheduleCtx}

Generate exactly 3 LinkedIn posts (Monday, Wednesday, Friday). Friday must be a case study. Each post must end with 5 hashtags relevant to that specific post's topic (see hashtag rules above). Return a JSON array of 3 objects.`;

  let igPosts: PostDraft[], liPosts: PostDraft[];
  try {
    const [igRaw, liRaw] = await Promise.all([callClaude(igPrompt), callClaude(liPrompt)]);
    igPosts = parseJson(igRaw);
    liPosts = parseJson(liRaw);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const allPosts = [...igPosts, ...liPosts];

  const now = new Date().toISOString();
  const records = allPosts.map((p) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    title: p.title ?? "",
    date: p.date || null,
    on_screen_text: p.on_screen_text ?? "",
    description: p.description ?? "",
    platforms: [p.platform],
    content_type: p.content_type ?? "",
    status: "Drafting",
    notes: p.notes ?? "",
    performance_score: null,
    review_status: null,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    slides: Array.isArray(p.slides) ? p.slides : [],
    share_token: null,
    created_at: now,
  }));

  const { error: insertError } = await supabaseAdmin.from("posts").insert(records);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ generated: records.length, week: dates });
}
