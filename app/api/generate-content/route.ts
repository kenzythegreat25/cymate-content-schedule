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
        max_tokens: 3500,
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

const CLIENT_TESTIMONIALS = `
Real client testimonials you may use for feedback posts (quote accurately, do not fabricate):
- Lindsay Liu, Co-Founder at Super: "They've been responsive, thoughtful, and strategic in their approach."
- Branson Packard, Co-Founder at StoryIt: "Email is quickly becoming our top one or two sales channels."
- Kelly Zhou, Founder at FindArbor: "Incredible results, consistently filling my calendar with demos."
- Tucker Kelly, Head of Sales at Revv: "We've been seeing demo bookings weekly."
- Anthony Baltodano, Cofounder at Mission Inbox: "So many consistent positive responses. It's honestly mind-blowing."
- Calvin Goodman, Founder at Upsteer: "I've tried it myself and failed, so go with Cymate."
- Michael Hess, Cofounder at Emporia: "We went from not having cold outbound to regularly getting meetings."
- Raymond Chen, Founder at 11 Agency: "By far the best agency I've worked with."
- Alex Farman-Farmaian, Co-Founder at Compound: "They felt like part of the team very quickly."
- Alessandro Chesser, CEO at GetDynasty: "You cost less than an SDR and you're significantly more impactful."
- Molly Abbott, Co-Founder at Constructable: "Feels like working with a real partner."
- Damien Perez, Head of Sales at Kalpa: "Helped us double our demo meetings."
- Dayo, Head of GTM at Raylu: "We have seen our sales efforts grow in an unbelievable way."
- Jonathan, Founder at Homely: "Cold outreach — it's a game changer."
`.trim();

const BASE_INSTRUCTIONS = `
Cymate is a B2B outbound cold email agency. They run cold email campaigns for tech/SaaS companies — lead prospecting, ICP building, deliverability, reply management. GTM Engineers (not junior SDRs). Performance-based pricing.

TONE: Professional but human. First-person (we/our team/I). Conversational and approachable, never stiff. No em dashes (—), no emojis. Short, varied sentences. Never hard-sell — let the value speak. Write like a senior practitioner sharing genuine insight, not a brand pitching a service.

LANGUAGE STANDARDS: Use professional business language at all times. Avoid slang, informal expressions, or any words that would feel out of place in a B2B business context. Words like "sexy," "unsexy," "killer," "crush it," "hack," or similar casual/hype terms are not appropriate. Keep vocabulary sharp, grounded, and credible.

HOOK RULE: Every post must open with a strong hook — one line that earns the next. Challenge a common assumption, share a specific outcome, or open with a question that resonates with the target reader. The hook is the most important line.

IG CTAs: Soft and natural. "Link in bio" style. Reserve comment-to-unlock only for high-value giveaways.
LinkedIn CTAs: Soft and contextual. "visit cymate.io" or "link in the comments" for long URLs. Never "message us directly."

AVOID: Copybara case study, Prosal case study, cold email is dead, $100M stat, 150+ companies stat, Instagram intro post, IGNITE competition.

Return ONLY a valid JSON array. No markdown, no explanation.

TITLE RULE: Short, topic-only. No day names ever.

Each object:
{
  "platform": "Instagram" | "LinkedIn",
  "date": "YYYY-MM-DD",
  "title": "short topic-only title",
  "on_screen_text": "Instagram: short, punchy hook (3-10 words) that appears on the poster graphic. LinkedIn text posts: empty string. Carousels: first slide hook only.",
  "description": "Instagram: hook + 3-4 lines of value + CTA + blank line + 5 hashtags. Carousels: clean 2-4 line summary caption (not a slide list) that makes someone want to swipe, then hashtags. LinkedIn: 280-380 words, strong hook first line, story-driven, soft CTA at end, then 5 hashtags on their own line.",
  "slides": ["slide 1 text", "slide 2 text", ...] — Carousel only, 5-6 slides. Omit for all other types.,
  "content_type": "Static" | "Carousel" | "Text" | "Reel",
  "notes": "designer direction: clean graphic/poster for IG (no people in background), mood and visual style, reel script beats if Reel, or 'Client feedback post' if applicable"
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

${CLIENT_TESTIMONIALS}

${scheduleCtx}

Generate exactly 3 LinkedIn posts (Monday, Wednesday, Friday) following these content guidelines:
- Friday: always a detailed case study (fictional but realistic client, fresh industry, specific metrics, one thing that went wrong or surprised us)
- Monday or Wednesday (rotate — not every week): occasionally replace one post with a client feedback/testimonial post using a real quote from the testimonials list above. Feature the client name, company, and quote authentically. Frame it as social proof with context around what result they achieved.
- When not a feedback post, Monday and Wednesday should be a mix of: insight/framework posts, hot takes, behind-the-scenes process, or a shorter case study.
- Every post must end with 5 hashtags relevant to that specific post's topic (see hashtag rules above).
Return a JSON array of 3 objects.`;

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
