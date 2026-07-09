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

TONE: Professional but human. First-person (we/our team/I). Conversational and approachable, never stiff. No emojis. Short, varied sentences. Never hard-sell. Write like a senior practitioner sharing genuine insight, not a brand pitching a service.

EM DASH RULE: NEVER use em dashes (—) anywhere in any post. This is a hard rule with no exceptions. Replace with a comma, a period, or break into a new sentence.

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
  "on_screen_text": "Instagram: short, punchy hook (3-10 words) that appears on the poster graphic. LinkedIn: short, punchy hook (3-10 words) that appears on the LinkedIn graphic (except case studies — leave empty for those). Carousels: first slide hook only.",
  "description": "Instagram: hook + 3-4 lines of value + CTA + blank line + 5 hashtags. Carousels: clean 2-4 line summary caption (not a slide list) that makes someone want to swipe, then hashtags. LinkedIn: 280-380 words, strong hook first line, story-driven, ends with a direct question to the reader, soft CTA, then 5 hashtags on their own line.",
  "slides": ["slide 1 text", "slide 2 text", ...] — Carousel only, 5-6 slides. Omit for all other types.,
  "content_type": "Static" | "Carousel" | "Text" | "Reel",
  "notes": "For IG: designer direction — clean graphic/poster, no people in background, mood and visual style. For Reels: beat-by-beat script. For LinkedIn insight/testimonial posts: describe the poster concept — dark or neutral background, bold short text overlay matching the on_screen_text hook, color palette and mood. Keep it clean and professional, no stock photos of people. Case study posts: leave poster direction empty (template already exists). Always include: Generic reply template + subtle CTA idea."
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

  // Fetch last 30 post titles to give Claude real deduplication context
  const { data: recentPosts } = await supabaseAdmin
    .from("posts")
    .select("title, platform, date")
    .order("created_at", { ascending: false })
    .limit(30);
  const recentTitles = recentPosts?.map(p => `[${p.platform}] ${p.title} (${p.date})`).join("\n") ?? "None";

  const isoWeek = Math.ceil((new Date(dates.mon).getDate() + new Date(new Date(dates.mon).getFullYear(), 0, 1).getDay()) / 7);
  const includeReel = isoWeek % 2 === 1;
  // First week of the month = Monday falls on day 1–7 of the month
  const isFirstWeekOfMonth = new Date(dates.mon).getUTCDate() <= 7;

  const scheduleCtx = `
Dates: Mon=${dates.mon} Tue=${dates.tue} Wed=${dates.wed} Thu=${dates.thu} Fri=${dates.fri}
Tuesday IG: Carousel (5-6 slides)
Thursday IG: ${includeReel ? "Reel (45-60s — include beat-by-beat script in notes)" : "Static graphic poster"}
All IG posts: clean graphic/poster, no people in background needed. on_screen_text is always a short hook visible on the poster.
`.trim();

  const igPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}

RECENTLY PUBLISHED POSTS (do not duplicate any of these topics or angles):
${recentTitles}

GENERIC REPLY RULE: For every post, include a generic reply template in the notes field that Cymate can use to respond to people who comment on the post. It should feel like a genuine, warm response — not a bot, not a sales pitch. It should acknowledge the commenter, add a small bit of value or continue the conversation, and optionally invite them to share their own experience. Write it to work for most comments on that post (e.g., someone saying "great post", "this is so true", "we've had this issue too"). The reply should match the tone and context of the post. Label it clearly: "Generic reply: [text]". Also include a subtle CTA: "Reminder: share this post to your Stories after posting to boost reach."

Generate EXACTLY 5 Instagram posts. One post per weekday, no more, no less:
1. Monday — ${dates.mon} — Static graphic poster
2. Tuesday — ${dates.tue} — Carousel (5-6 slides)
3. Wednesday — ${dates.wed} — Static graphic poster
4. Thursday — ${dates.thu} — ${includeReel ? "Reel (45-60s)" : "Static graphic poster"}
5. Friday — ${dates.fri} — Static graphic poster

Rules:
- Clean graphic/poster for all posts. No people in background. on_screen_text is always a short hook on the poster.
- Every caption must include a natural save nudge (e.g. "Save this for your next campaign" or "Bookmark this before you start your next sequence"). Place it before the hashtags.
- End every post with 5 relevant hashtags on their own line. Never repeat the same 5 hashtags from post to post — rotate from the pool.
- NEVER use em dashes (—).
- Do not duplicate any topic or angle from the recently published posts listed above.
- POSTING TIME: Include "Post at: 8:00 PM PHT" at the top of every notes field so the scheduler knows exactly when to publish. (Audience peaks at 9 PM PHT — post 1 hour before to warm up distribution.)
- The JSON array must have EXACTLY 5 objects — one per day listed above. Count them before returning.
Return a JSON array of exactly 5 objects.`;

  const liPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}

${CLIENT_TESTIMONIALS}

RECENTLY PUBLISHED POSTS (do not duplicate any of these topics or angles):
${recentTitles}

GENERIC REPLY RULE: For every post, include a generic reply template in the notes field that Cymate can use to respond to people who comment on the post. It should feel like a genuine, warm response — not a bot, not a sales pitch. It should acknowledge the commenter, add a small bit of value or continue the conversation, and optionally invite them to share their own experience. Write it to work for most comments on that post (e.g., someone saying "great post", "this is so true", "we've had this issue too"). The reply should match the tone and context of the post. Label it clearly: "Generic reply: [text]". Also include a subtle, non-obvious CTA idea in the notes (e.g., "Happy to share the full breakdown if useful" or "Drop a comment and we can dig into it together").

Generate EXACTLY 3 LinkedIn posts. One post per publishing day, no more, no less:
1. Monday — ${dates.mon}
2. Wednesday — ${dates.wed}
3. Friday — ${dates.fri}

Content per day:
MONDAY (${dates.mon}): Insight, framework, hot take, or behind-the-scenes process post. Directly relevant to a pain point Cymate's ICP faces. Strong hook, story-driven, 280-350 words.

WEDNESDAY (${dates.wed}): A case study post referencing a real result from Cymate's work. Write the post around a specific outcome or challenge (you can draw inspiration from the testimonials). The full case study lives on cymate.io — end the post with a natural line like "Full breakdown in the comments" or "I'll drop the link in the comments" and note in the notes field: "Poster: case study template. Drop the cymate.io case study link in the first comment after posting." 300-380 words.

FRIDAY (${dates.fri}): Alternate every 2 weeks between:
- A client testimonial/feedback post: pick one quote from the testimonials list, feature the client name and company authentically, add context around the result they achieved. 200-280 words.
- An insight or tip post on B2B outbound strategy. 280-350 words.
(This week: odd ISO week = testimonial, even ISO week = insight. Week ${isoWeek} is ${isoWeek % 2 === 1 ? "odd — use a testimonial" : "even — use an insight post"}.)

RELEVANCE RULE: Every LinkedIn post must be directly relevant to the specific problems Cymate's target audience faces — B2B founders, sales leaders, SDR managers, and GTM teams at tech and SaaS companies. Topics must connect to real pain points: cold email deliverability, outbound sequencing, reply rates, pipeline generation, ICP definition, sender reputation, or scaling outbound without hiring. Never post generic business advice that could apply to any industry. Every post should make a sales leader or founder think "this is exactly what we deal with."

INSTAGRAM CROSS-PROMO RULE (this week only — first week of the month: ${isFirstWeekOfMonth}):
${isFirstWeekOfMonth ? `This is the first week of the month. One of the 3 LinkedIn posts must include a natural, low-key mention of Cymate's Instagram account (@cymate_io) to encourage LinkedIn followers to follow on Instagram too. Work it in organically at the end of the post — not as a hard CTA, more like a casual mention: e.g. "If you prefer shorter-form tips, we also post daily on Instagram — @cymate_io." Pick whichever post fits most naturally (usually Monday or Friday). Do not force it into the case study.` : `No Instagram cross-promo this week.`}

RULES FOR ALL 3 POSTS:
- NEVER use em dashes (—). Use commas, short sentences, or line breaks instead.
- End every post with a direct question to the reader (to drive comments).
- End every post with 5 relevant hashtags on their own line. Rotate hashtags — never reuse the same set across posts.
- Do not duplicate topics, client names, or angles from the recently published posts listed above.
- No fictional case study client should share a name with any real Cymate client listed in the testimonials.
- POSTING TIME: Include "Post at: 8:00 PM PHT" at the top of every notes field so the scheduler knows exactly when to publish. (Audience peaks at 9 PM PHT — post 1 hour before to warm up distribution.)
- The JSON array must have EXACTLY 3 objects — one for Monday, one for Wednesday, one for Friday. Count them before returning.

Return a JSON array of exactly 3 objects.`;

  let igPosts: PostDraft[], liPosts: PostDraft[];
  try {
    const [igRaw, liRaw] = await Promise.all([callClaude(igPrompt), callClaude(liPrompt)]);
    igPosts = parseJson(igRaw);
    liPosts = parseJson(liRaw);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (igPosts.length !== 5) return NextResponse.json({ error: `Expected 5 IG posts, got ${igPosts.length}` }, { status: 500 });
  if (liPosts.length !== 3) return NextResponse.json({ error: `Expected 3 LinkedIn posts, got ${liPosts.length}` }, { status: 500 });

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
