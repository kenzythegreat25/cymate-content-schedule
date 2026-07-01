import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const ALLOWED_EMAIL   = "kenc@cymate.io";
const ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Sunday 10 AM PH = Sunday 02:00 UTC → cron "0 2 * * 0"
// This route is called by Vercel Cron. Also callable manually via POST with { manual: true }.

function getWeekDates(): Record<string, string> {
  // Called Sunday → generate Mon–Fri of the coming week
  const now = new Date();
  // Find next Monday
  const day = now.getUTCDay(); // 0=Sun
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + daysUntilMon);
  mon.setUTCHours(0, 0, 0, 0);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const add = (d: Date, n: number) => {
    const x = new Date(d); x.setUTCDate(d.getUTCDate() + n); return x;
  };

  return {
    mon: fmt(mon),
    tue: fmt(add(mon, 1)),
    wed: fmt(add(mon, 2)),
    thu: fmt(add(mon, 3)),
    fri: fmt(add(mon, 4)),
  };
}

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json() as { content: { text: string }[] };
  return data.content[0].text;
}

const BRAND_CONTEXT = `
ABOUT CYMATE:
Cymate is a B2B outbound agency that manages cold email campaigns and prospecting for tech/SaaS companies. They handle everything from lead identification to booking meetings.

Services: lead prospecting, ICP identification, campaign strategy, cold email execution, lead list building, email deliverability, reply management, ongoing optimization.

Key stats: $100M+ in closed revenue across 150+ B2B clients, first demo in 21-30 days, 60% cheaper than in-house SDRs.
Differentiator: In-house GTM Engineers (not junior SDRs running templates), performance-based pricing, guaranteed outcomes.
Tagline: "Just Start Sending"
Tone: Direct, results-focused, confident but not aggressive, data-driven, conversational yet professional.

PROVEN CTAs:
- "Comment [KEYWORD] for the full case study"
- "Book a call at cymate.io"
- "Schedule a call at cymate.io"
- "Drop a comment below"
- "DM us to learn more"

CONTENT STYLE FROM EXISTING POSTS:
- Case studies: real client names, specific metrics ($500K pipeline, 1,300+ deals, 15+ meetings/month)
- Pattern interruption hooks that challenge assumptions
- Transparent about failures and iterations, not just wins
- Never generic "growth hacking" language
- Relatable business pain points then unexpected insights
- LinkedIn: 250-400 word narrative posts, storytelling with data
- Instagram: short punchy captions, stat-heavy graphics, comment-to-unlock CTAs
`.trim();

export async function GET(req: Request) {
  // Verify Vercel cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runGeneration();
}

export async function POST(req: Request) {
  // Manual trigger — verify it's kenc@cymate.io
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({})) as { token?: string };

  // Use the Authorization header Bearer token to verify user
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
  if (!user || user.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return runGeneration();
}

async function runGeneration() {
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  if (!SERVICE_KEY)   return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Get kenc@cymate.io user ID
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const adminUser = usersData?.users?.find((u) => u.email === ALLOWED_EMAIL);
  if (!adminUser) return NextResponse.json({ error: "Admin user not found" }, { status: 500 });
  const userId = adminUser.id;

  const dates = getWeekDates();

  // Decide randomly how many IG posts get "people in background" this week (2 or 3)
  const peopleCount = Math.random() < 0.5 ? 3 : 2;
  // Pick which IG days get people (from Mon/Tue/Wed/Thu/Fri)
  const igDays = ["mon", "tue", "wed", "thu", "fri"];
  const shuffled = igDays.sort(() => Math.random() - 0.5);
  const peopleDays = new Set(shuffled.slice(0, peopleCount));

  const prompt = `
You are a content strategist for Cymate, a B2B outbound cold email agency.

${BRAND_CONTEXT}

Today is Sunday. Generate exactly 8 social media posts for the coming week (Monday through Friday). Output ONLY valid JSON — no explanation, no markdown, just raw JSON.

SCHEDULE:
- Instagram: all 5 weekdays (Mon, Tue, Wed, Thu, Fri)
- LinkedIn: Monday, Wednesday, Friday
- LinkedIn Friday: MUST be a detailed case study post (use a real-sounding client, industry, and specific metrics)
- These IG days should feature people working/in office in the poster background: ${Array.from(peopleDays).join(", ")} (${peopleCount} posts total). The content should NOT be about the people — they are just background. Other IG posts should be graphic/stat/text-based.

Return a JSON array of exactly 8 objects with this structure:
{
  "platform": "Instagram" | "LinkedIn",
  "date": "YYYY-MM-DD",
  "title": "short internal title for the post concept",
  "on_screen_text": "text that goes ON the graphic/poster (short, punchy, 3-10 words). For LinkedIn text posts write empty string.",
  "description": "full caption / post body with hook, content, and CTA",
  "content_type": "Static" | "Carousel" | "Text" | "Short-Form Video" | "Reel",
  "notes": "brief creative direction for the designer — poster style, people in background yes/no, mood, colors etc."
}

Dates to use:
- Monday: ${dates.mon}
- Tuesday: ${dates.tue}
- Wednesday: ${dates.wed}
- Thursday: ${dates.thu}
- Friday: ${dates.fri}

IMPORTANT RULES:
- Do NOT repeat topics used in these existing Cymate posts: Copybara case study, Prosal case study, cold email not working, $100M revenue stat, 150+ B2B companies stat, Instagram intro post, IGNITE GTM competition
- Vary content types: mix hooks/hot takes, tips, client wins, frameworks, stats, case studies
- Instagram captions: short and punchy (2-5 lines max) + CTA
- LinkedIn posts: 250-400 words, strong hook first line, storytelling, end with CTA
- CTAs must feel natural, not salesy
- Case study post (LinkedIn Friday): use a fictional but realistic client (different industry from Copybara/Prosal), include specific metrics, narrative format
- Make content feel fresh, not templated

Output only the JSON array. No other text.
`.trim();

  let raw: string;
  try {
    raw = await callClaude(prompt);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Parse JSON — strip any accidental markdown fences
  const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
  let posts: {
    platform: string;
    date: string;
    title: string;
    on_screen_text: string;
    description: string;
    content_type: string;
    notes: string;
  }[];
  try {
    posts = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response", raw }, { status: 500 });
  }

  // Insert into Supabase
  const records = posts.map((p) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    title: p.title ?? "",
    date: p.date ?? "",
    on_screen_text: p.on_screen_text ?? "",
    description: p.description ?? "",
    platforms: [p.platform],
    content_type: p.content_type ?? "",
    status: "Drafting",
    notes: p.notes ?? "",
    performance_score: "",
    review_status: "",
    review_note: "",
    reviewed_by: "",
    reviewed_at: "",
    slides: [],
    share_token: "",
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabaseAdmin.from("posts").insert(records);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ generated: records.length, week: dates });
}
