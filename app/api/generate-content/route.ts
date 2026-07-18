import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const ALLOWED_EMAIL = "kenc@cymate.io";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SLACK_TOKEN   = process.env.SLACK_TOKEN ?? "";
const WINS_CHANNEL  = "C07GM6BHVMG";

type SlackMessage = {
  text?: string;
  ts?: string;
  files?: Array<{ permalink?: string; url_private?: string; mimetype?: string }>;
};

// Keywords that signal a message is about Cymate's actual outbound results
const WINS_RELEVANCE_KEYWORDS = [
  "meeting", "booked", "booking", "demo", "call scheduled", "calendar",
  "reply", "replied", "positive response", "interested", "responded",
  "campaign", "sequence", "outbound", "cold email", "cold outreach",
  "pipeline", "deal", "closed", "signed", "revenue", "conversion",
  "lead", "prospect", "inbox", "deliverability", "open rate", "click rate",
  "client", "results", "win", "performance", "launch", "went live",
  "meetings booked", "responses", "batch", "send volume", "sent",
];

function isRelevantWin(text: string): boolean {
  const lower = text.toLowerCase();
  // Must contain at least one outbound/results keyword
  return WINS_RELEVANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function fetchSlackWins(): Promise<string> {
  if (!SLACK_TOKEN) return "";
  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${WINS_CHANNEL}&limit=100`,
      { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
    );
    const data = await res.json();
    if (!data.ok) return "";

    const wins: string[] = (data.messages as SlackMessage[])
      .filter((m) =>
        m.text &&
        !m.text.includes("has joined") &&
        !m.text.includes("has renamed") &&
        !m.text.includes("has left") &&
        !m.text.includes("has set the channel") &&
        m.text.length > 40 &&
        isRelevantWin(m.text)
      )
      .map((m) => {
        const text = (m.text ?? "")
          .replace(/<@[A-Z0-9]+(\|[^>]+)?>/g, "a team member")
          .replace(/<https?:\/\/[^>]+>/g, "")
          .replace(/:[a-z_]+:/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        const ts = m.ts ?? "";
        const slackLink = ts
          ? `https://cymate.slack.com/archives/${WINS_CHANNEL}/p${ts.replace(".", "")}`
          : "";

        const imageFiles = (m.files ?? [])
          .filter((f) => f.mimetype?.startsWith("image/"))
          .map((f) => f.permalink ?? f.url_private ?? "")
          .filter(Boolean);

        let entry = text;
        if (slackLink) entry += ` [slack: ${slackLink}]`;
        if (imageFiles.length > 0) entry += ` [images: ${imageFiles.join(", ")}]`;
        return entry;
      })
      .filter((t) => t.length > 30)
      .slice(0, 20);

    return wins.length > 0 ? wins.join("\n") : "";
  } catch {
    return "";
  }
}

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
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [4000, 10000, 20000]; // ms between retries on 529

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
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
          max_tokens: 5000,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 529 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      if (!res.ok) {
        const err = await res.text().catch(() => res.status.toString());
        throw new Error(`Claude API ${res.status}: ${err}`);
      }
      const data = await res.json() as { content: { text: string }[] };
      return data.content[0].text;
    } catch (e) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES && (e as Error).name !== "AbortError") {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Claude API failed after retries");
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

ONE ASK RULE: Every post gets exactly ONE primary ask. Choose one: a save nudge, a direct question, or a link callout. Never stack more than one in the same caption/post. A short closing CTA line (e.g. "Link in bio") is fine as a passive exit action, but it does not count as a second ask — don't pair it with both a save nudge AND a question in the same post.

NOTES FORMAT RULE: The notes field must be structured with each section clearly separated. Never write it as one continuous paragraph. Use this order: (1) "Post at: [time]" (2) Designer direction or Reel script (3) "Q&A Replies:" followed by Q1 through Q3, each on its own line in the format "Q1: [likely comment or question] — A: [warm, genuine reply]" (4) Any additional reminders. Keep each Q&A reply concise — one or two sentences max.

DESIGNER DIRECTION RULES: For IG static posts, use Cymate brand colors. 3 out of 5 IG posts per week should feature real people (candid, professional, authentic — not stock-photo looking). The other 2 should be clean text/graphic posters with no people. Decide which posts get people based on content fit and specify clearly in each post's designer direction. For Reels: write a beat-by-beat script instead of designer direction. For LinkedIn insight/testimonial posts: dark or neutral background, bold short text overlay matching the on_screen_text hook, Cymate brand colors, no stock photos of people. Case study posts: leave designer direction empty (template already exists).

AVOID: Copybara case study, Prosal case study, cold email is dead, $100M stat, 150+ companies stat, Instagram intro post, IGNITE competition.

Return ONLY a valid JSON array. No markdown, no explanation.

TITLE RULE: Short, topic-only. No day names ever.

Each object:
{
  "platform": "Instagram" | "LinkedIn",
  "date": "YYYY-MM-DD",
  "title": "short topic-only title",
  "on_screen_text": "Instagram: short, punchy hook (3-10 words) that appears on the poster graphic. LinkedIn: short, punchy hook (3-10 words) that appears on the LinkedIn graphic (except case studies — leave empty for those). Carousels: first slide hook only.",
  "description": "Instagram static/reel: Structure the caption in clearly separated short blocks — NOT a continuous paragraph. Format exactly like this: [Line 1: Hook — one punchy sentence that stops the scroll] [blank line] [Line 2-4: Value — 2 to 3 short punchy sentences, each on its own line, max 10 words each. One idea per line. No run-ons.] [blank line] [Line 5: ONE primary ask — choose either a save nudge (e.g. 'Save this before your next campaign.') OR a direct interactive question (e.g. 'What's your biggest challenge with cold outreach right now?'). Never include both in the same caption. Vary which one you pick across the week's posts.] [blank line] [Line 6: Soft closing line — e.g. 'Link in bio for more.' Keep it short; this is a closing action, not a second ask.] [blank line] [5 hashtags on their own line]. Carousels: clean 2-4 line summary caption using the same short-line format, then the interactive question, then hashtags. LinkedIn: 280-380 words, strong hook first line, story-driven, short paragraphs with line breaks, ends with a direct question to the reader, soft CTA, then 5 hashtags on their own line.",
  "slides": ["slide 1 text", "slide 2 text", ...] — Carousel only, 5-6 slides. Omit for all other types.,
  "content_type": "Static" | "Carousel" | "Text" | "Reel",
  "notes": "Structured plain text field — see NOTES FORMAT RULE below."
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
  const body = await req.json().catch(() => ({}));
  return runGeneration(user.id, body);
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
  // Find the first '[' and walk to its matching ']', ignoring any text before/after
  const start = raw.indexOf("[");
  if (start === -1) throw new Error("No JSON array found in Claude response");
  let depth = 0, end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") { if (--depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Unclosed JSON array in Claude response");
  return JSON.parse(raw.slice(start, end + 1));
}

// Normalize a title to key words for fuzzy comparison
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\b(a|an|the|your|our|why|how|what|when|is|are|to|in|on|of|for|and|with|that|this)\b/g, "").replace(/\s+/g, " ").trim();
}

// Returns true if two strings share enough core words to be considered duplicates
function textTooSimilar(a: string, b: string, threshold = 0.55): boolean {
  const na = normalizeTitle(a).split(" ").filter(w => w.length > 3);
  const nb = normalizeTitle(b).split(" ").filter(w => w.length > 3);
  if (na.length === 0 || nb.length === 0) return false;
  const shared = na.filter(w => nb.includes(w));
  return shared.length / Math.min(na.length, nb.length) >= threshold;
}

// Returns true if two full captions/descriptions are too similar in body content
function descriptionTooSimilar(a: string, b: string): boolean {
  // Strip hashtags before comparing
  const strip = (s: string) => s.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  return textTooSimilar(strip(a), strip(b), 0.45);
}

async function runSinglePostGeneration(
  userId: string,
  opts: { platform?: string; contentType?: string; date?: string; topicHint?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any
): Promise<Response> {
  const { platform = "Instagram", contentType = "Static", date, topicHint } = opts;

  // Fetch all existing posts for dedup
  const { data: allPostsRaw } = await supabaseAdmin
    .from("posts")
    .select("title, description, platform, date, status")
    .order("created_at", { ascending: false });

  const allPosts = (allPostsRaw ?? []) as { title: string; description: string; platform: string; date: string; status: string }[];

  const allExistingTitles       = allPosts.map(p => p.title.toLowerCase());
  const allExistingHooks        = allPosts.map(p => (p.description ?? "").split("\n")[0].toLowerCase());
  const allExistingDescriptions = allPosts.map(p => (p.description ?? "").toLowerCase());
  const recentTitles = allPosts.map(p => {
    const desc = (p.description ?? "").replace(/#\S+/g, "").trim().slice(0, 160);
    return `[${p.platform}] ${p.title} | caption: "${desc}" (${p.date} · ${p.status})`;
  }).join("\n") || "None";

  const topicLine = topicHint ? `\nTOPIC HINT: The post should be about: "${topicHint}". Use this as the angle — don't ignore it.` : "";

  const prompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}

${platform === "LinkedIn" ? CLIENT_TESTIMONIALS + "\n\n" : ""}EXISTING POSTS — ALL STATUSES:
${recentTitles}

DEDUPLICATION RULE (hard): Every title, hook, and topic above is off-limits — including similar angles, the same subject reframed, and close variations on the same theme. The opening hook line must also be distinct from any existing hook shown above.
${topicLine}

Generate EXACTLY 1 ${platform} post. Content type: ${contentType}. Date: ${date ?? new Date().toISOString().slice(0, 10)}.

Rules:
- Follow all BASE_INSTRUCTIONS above.
- NEVER use em dashes (—).
- End with 5 relevant hashtags on their own line.
- POSTING TIME: Include "Post at: 8:00 PM PHT" at the top of the notes field.
- Include 3 Q&A reply pairs in notes (Q1–Q3 format).
- Before returning, verify: strong hook, exactly ONE primary ask, no em dashes.

Return a JSON array with EXACTLY 1 object using the same schema as always.`;

  let posts: PostDraft[];
  try {
    const raw = await callClaude(prompt);
    posts = parseJson(raw);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (posts.length !== 1) {
    return NextResponse.json({ error: `Expected 1 post, got ${posts.length}` }, { status: 500 });
  }

  // Duplicate check — title, hook, and full description
  const post = posts[0];
  const generatedHook = (post.description ?? "").split("\n")[0];
  for (const existing of allExistingTitles) {
    if (textTooSimilar(post.title, existing)) {
      return NextResponse.json(
        { error: `Title "${post.title}" is too similar to an existing post. Try again.` },
        { status: 409 }
      );
    }
  }
  for (const existingHook of allExistingHooks) {
    if (existingHook.length > 10 && textTooSimilar(generatedHook, existingHook, 0.6)) {
      return NextResponse.json(
        { error: `Caption hook is too similar to an existing post. Try again.` },
        { status: 409 }
      );
    }
  }
  for (const existingDesc of allExistingDescriptions) {
    if (existingDesc.length > 40 && descriptionTooSimilar(post.description ?? "", existingDesc)) {
      return NextResponse.json(
        { error: `Caption body is too similar to an existing post. Try again with a different angle.` },
        { status: 409 }
      );
    }
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    user_id: userId,
    title: post.title ?? "",
    date: post.date || date || null,
    on_screen_text: post.on_screen_text ?? "",
    description: post.description ?? "",
    platforms: [platform],
    content_type: post.content_type ?? contentType,
    status: "Drafting",
    notes: post.notes ?? "",
    performance_score: null,
    review_status: null,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    slides: Array.isArray(post.slides) ? post.slides : [],
    share_token: null,
    created_at: now,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await supabaseAdmin.from("posts").insert([record as any]);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ generated: 1, post: record });
}

async function runGeneration(userId: string, opts: { mode?: string; platform?: string; contentType?: string; date?: string; topicHint?: string } = {}): Promise<Response> {
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  if (!SERVICE_KEY)   return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

  if (opts.mode === "single") {
    return runSinglePostGeneration(userId, opts, supabaseAdmin);
  }

  const dates = getWeekDates();


  // Fetch ALL existing posts (title + first line of description) for deduplication — no limit
  const { data: recentPosts } = await supabaseAdmin
    .from("posts")
    .select("title, description, platform, date, status")
    .order("created_at", { ascending: false });
  const allExistingTitles       = recentPosts?.map(p => p.title.toLowerCase()) ?? [];
  const allExistingHooks        = recentPosts?.map(p => (p.description ?? "").split("\n")[0].toLowerCase()) ?? [];
  const allExistingDescriptions = recentPosts?.map(p => (p.description ?? "").toLowerCase()) ?? [];
  const recentTitles = recentPosts?.map(p => {
    const desc = (p.description ?? "").replace(/#\S+/g, "").trim().slice(0, 160);
    return `[${p.platform}] ${p.title} | caption: "${desc}" (${p.date} · ${p.status})`;
  }).join("\n") ?? "None";

  const isoWeek = Math.ceil((new Date(dates.mon).getDate() + new Date(new Date(dates.mon).getFullYear(), 0, 1).getDay()) / 7);
  const includeReel = isoWeek % 2 === 1;
  const isFirstWeekOfMonth = new Date(dates.mon).getUTCDate() <= 7;

  const winsRaw = await fetchSlackWins();
  const winsContext = winsRaw
    ? `\nRECENT WINS CONTEXT (use as INSPIRATION only — do NOT name specific clients, do NOT write testimonials, anonymize all company and client names, extract the strategic insight or result pattern):\n${winsRaw}\n`
    : "";

  const scheduleCtx = `
Dates: Mon=${dates.mon} Tue=${dates.tue} Wed=${dates.wed} Thu=${dates.thu} Fri=${dates.fri}
Tuesday IG: Carousel (5-6 slides)
Thursday IG: ${includeReel ? "Reel (45-60s — include beat-by-beat script in notes)" : "Static graphic poster"}
`.trim();

  const igPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}
${winsContext}
EXISTING POSTS — ALL STATUSES (Drafting, Review, Scheduled, Posted):
${recentTitles}

DEDUPLICATION RULE (hard): Every title, hook, and topic above is off-limits — including similar angles, the same subject reframed, and close variations on the same theme. Do not post about reply rates if a reply-rate post already exists. Do not post about deliverability if a deliverability post already exists. The opening hook line of each caption must also be distinct — do not start a caption with the same premise or framing as any existing hook shown above. The test: could someone read both posts and think "this is basically the same topic" or "this hook makes the same point"? If yes, pick something else entirely.

GENERIC REPLY RULE: For every post, include 3 Q&A reply pairs in the notes field. Each pair should anticipate a real comment or question someone might leave on that specific post and provide a warm, genuine response that adds value — not a bot reply, not a sales pitch. The replies should feel like a real person continuing the conversation. Base each Q on a likely reaction to that post's specific content. Format exactly as: Q1: [comment/question] — A: [reply]. Do this for Q1 through Q3. Keep each reply one or two sentences. Also add at the end of notes: "Reminder: share this post to your Stories after posting to boost reach."

Generate EXACTLY 5 Instagram posts. One post per weekday, no more, no less:
1. Monday — ${dates.mon} — Static graphic poster [WINS POST]
2. Tuesday — ${dates.tue} — Carousel (5-6 slides) [STRATEGY POST]
3. Wednesday — ${dates.wed} — Static graphic poster [WINS POST]
4. Thursday — ${dates.thu} — ${includeReel ? "Reel (45-60s)" : "Static graphic poster"} [STRATEGY POST]
5. Friday — ${dates.fri} — Static graphic poster [STRATEGY POST]

CONTENT STRATEGY — STRICTLY ENFORCED:
- IG is for STRATEGY and WINS only. Every post must be educational, strategic, or results-oriented content directly related to Cymate's work, methodology, or GTM approach.
- NEVER generate testimonials, client feedback posts, or case studies from clients on Instagram. Do not reference specific clients by name, do not quote client results, do not write posts framed as "a client told us..." or "one of our clients achieved...". These content types are off-limits on IG entirely.

WINS POSTS (Monday + Wednesday): Draw inspiration from the RECENT WINS CONTEXT above. Select the 3 to 5 most impactful and relevant wins — prioritize ones with concrete metrics (meetings booked, campaign results, reply rates, deals, pipeline outcomes) over vague shoutouts. Combine these wins into a single strategic narrative post that highlights a pattern or system insight, not just a list of achievements. The post must feel purposeful: extract the "what this proves" angle.

CRITICAL — SOURCE LINKS IN NOTES: Each win entry may include a [slack: URL] and/or [images: URL] tag. For every win you draw from to write this post, copy its links into the notes field as a numbered list. Format exactly like this (repeat for each win used, up to 5):
"Win sources used:
1. Source: [slack URL 1] | Images: [image URL(s) 1]
2. Source: [slack URL 2] | Images: [image URL(s) 2]
..."
If a win has no slack/image URL, write "Source: (no link)" for that entry. Never omit this section from wins post notes — even if only 1 win was used.

STYLE GUIDE for wins posts — follow this exactly:
- Hook = a specific result or metric in the first line, no fluff. Examples: "8-12 meetings booked every week for a client. No ads. No organic. Just cold email." / "New campaign launched. Meeting booked within 2 hours." / "One copy tweak. Two meetings in three days."
- Body = short paragraphs of 1-3 sentences max. Break down the HOW — what system, infrastructure change, or process made it happen. Attribute results to process and methodology, never luck or individual talent.
- Use specific numbers where possible (draw from wins context — anonymize client names but keep the numbers).
- Frame as Cymate's result: "We did X. Here's what changed." Never name the client.
- Tone: confident, direct, conversational. Like a practitioner sharing a real observation, not a marketer writing a case study.

STRATEGY POSTS (Tuesday, Thursday, Friday): Pure educational/framework content. Outbound frameworks, deliverability insights, cold email strategy, ICP definition, pipeline thinking, sequencing tactics, founder GTM lessons, or Cymate's own process shared as a brand. No wins framing needed here — just straight value.

- Focus on: making every post feel like it comes from a team that's actually in the trenches doing outbound every day.
- CAPTION STRUCTURE — this exact order, every single post, no exceptions:
  1. Hook line (grabs attention immediately)
  2. Body (educational/strategic content, 3-6 short paragraphs or punchy lines)
  3. Engaging question (invites a reply — one sentence ending with "?")
  4. CTA on its own line — pick based on post angle: "Book a discovery call — link in bio." / "Let's talk — link in bio." / "Learn more — link in bio." / "Follow for daily outbound tips." The CTA must ALWAYS appear here, after the question and BEFORE the hashtags. Never skip it. Never bury it.
  5. Hashtags (5, on their own line)
- The engaging question and CTA are BOTH required in every caption — the question drives comments, the CTA drives action. They are not interchangeable and neither replaces the other.

Rules:
- on_screen_text is always a short hook visible on the poster graphic.
- 3 of the 5 posts this week should feature real people (candid, professional, authentic — not stock-photo looking). The other 2 should be clean text/graphic posters with no people. Decide which posts get people based on which content type fits best. Specify clearly in each post's designer direction notes whether it uses a person visual or a graphic-only poster.
- Use Cymate brand colors throughout all graphic directions.
- Every caption gets exactly ONE primary ask per the ONE ASK RULE above — a save nudge OR a direct question, never both. Don't default to the same one every day; vary it across the 5 posts.
- End every post with 5 relevant hashtags on their own line. Never repeat the same 5 hashtags from post to post — rotate from the pool.
- NEVER use em dashes (—).
- Do not duplicate any topic or angle from the recently published posts listed above.
- POSTING TIME: Include "Post at: 8:00 PM PHT" at the top of every notes field so the scheduler knows exactly when to publish. (Audience peaks at 9 PM PHT — post 1 hour before to warm up distribution.)
- The JSON array must have EXACTLY 5 objects — one per day listed above. Count them before returning.
- Before returning the JSON, check each post: does the first line work as a hook with zero context, is there exactly ONE primary ask (not stacked), and does it end with a CTA? Revise any post that fails any of these checks.
Return a JSON array of exactly 5 objects.`;

  const liWeeklyPrompt = `${BASE_INSTRUCTIONS}

${IG_HASHTAG_POOL}
${winsContext}
EXISTING POSTS — ALL STATUSES (Drafting, Review, Scheduled, Posted):
${recentTitles}

DEDUPLICATION RULE (hard): Every title, hook, and topic above is off-limits — including similar angles, the same subject reframed, and close variations on the same theme. The test: could someone read both posts and think "this is basically the same topic"? If yes, pick something else entirely.

Generate EXACTLY 3 LinkedIn posts for this week:
1. Monday — ${dates.mon}
2. Wednesday — ${dates.wed}
3. Friday — ${dates.fri}

CONTENT STRATEGY: All posts must be directly related to what Cymate does — cold email infrastructure, outbound sequencing, B2B deliverability, ICP targeting, or GTM execution for SaaS and tech companies. Write from Cymate's perspective as a practitioner. These are NOT testimonial, case study, or client feedback posts — they are strategic thought leadership posts.

MONDAY (${dates.mon}): A strategy or educational post. Teach something — a concept, a framework, a common mistake and how to fix it, or a principle behind great outbound. Make it feel like a lesson from someone who runs campaigns every day. 280-350 words.

WEDNESDAY (${dates.wed}): A framework, process, or insight post. Share something actionable — a step-by-step approach, a mental model, or a lesson from running outbound campaigns. Make the reader feel like they're getting access to Cymate's internal playbook. 280-350 words.

FRIDAY (${dates.fri}): A wins-inspired strategic post. Draw from the RECENT WINS CONTEXT above. Select the 3 to 5 most impactful and relevant wins — prioritize ones with concrete metrics (meetings booked, campaign results, reply rates, deals closed, pipeline outcomes) over vague shoutouts. Synthesize them into one strategic narrative that extracts a pattern, system insight, or lesson. The post must feel purposeful and data-driven — not just a celebration, but proof of a methodology.

CRITICAL — SOURCE LINKS IN NOTES: Each win entry may include a [slack: URL] and/or [images: URL] tag. For every win you draw from, copy its links into the notes field as a numbered list. Format exactly like this:
"Win sources used:
1. Source: [slack URL 1] | Images: [image URL(s) 1]
2. Source: [slack URL 2] | Images: [image URL(s) 2]
..."
If a win has no slack/image URL, write "Source: (no link)" for that entry. Never omit this section from the Friday wins post notes.

STYLE GUIDE — follow this exactly, modeled after top-performing outbound thought leadership posts:
- Hook = a specific result or metric in the very first line. No preamble. Examples: "8-12 meetings booked every week. No ads. No organic. Just cold email." / "New campaign. Meeting booked in 2 hours." / "One copy change. Two meetings in three days."
- Body = short paragraphs, 1-3 sentences max. Break down the HOW — the system, infrastructure fix, copy approach, or process change that drove the result. Attribute wins to methodology and process, never luck.
- Use specific numbers from the wins context where possible. Anonymize client names — never name them.
- Frame in first person as Cymate: "We launched X. Here's what happened." or "We changed Y. Results:"
- Tone: confident, direct, practitioner-voice. Like someone sharing a real observation from the trenches, not a polished case study.
- 200-280 words.

AUDIENCE: B2B founders, sales leaders, and GTM teams at SaaS/tech companies. Many are in Latin America (Colombia, Argentina, Costa Rica, Mexico) — lean teams, founder-led sales, scrappy outbound. Write in English with empathy for that reality.

RULES FOR ALL 3 POSTS:
- Strong opening hook — must work with zero context as the first line
- CAPTION STRUCTURE — this exact order, every single post, no exceptions:
  1. Hook (first line — stops the scroll)
  2. Body (short paragraphs, story/insight/framework)
  3. Engaging question (one sentence ending with "?" — drives comments)
  4. Soft CTA — always after the question, always before hashtags. Keep it natural and low-pressure, e.g. "If you want to dig into this for your own outbound, feel free to book a call — link in bio." or "Happy to walk through how we'd approach this for your team — grab a time at cymate.io." or "If this resonates, let's talk — book a quick call via the link in bio." Vary the wording — never copy-paste the same line post to post.
  5. Hashtags (5, on their own line)
- The engaging question and soft CTA are BOTH required in every post. Neither replaces the other.
- End every post with 5 relevant hashtags on their own line. Rotate — never reuse the same set across posts.
- NEVER use em dashes (—)
- POSTING TIME: Include "Post at: 8:00 PM PHT" at the top of each notes field
- Include 3 Q&A reply pairs in notes (Q1/Q2/Q3 format, warm and genuine)
- The JSON array must have EXACTLY 3 objects. Count before returning.

Return a JSON array of exactly 3 objects.`;

  let igPosts: PostDraft[], liPosts: PostDraft[];
  try {
    const [igRaw, liRaw] = await Promise.all([callClaude(igPrompt), callClaude(liWeeklyPrompt)]);
    igPosts = parseJson(igRaw);
    liPosts = parseJson(liRaw);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (igPosts.length !== 5) return NextResponse.json({ error: `Expected 5 IG posts, got ${igPosts.length}` }, { status: 500 });
  if (liPosts.length !== 3) return NextResponse.json({ error: `Expected 3 LinkedIn posts, got ${liPosts.length}` }, { status: 500 });

  // Post-generation duplicate check: title, hook, and full description body
  const allGenerated = [...igPosts, ...liPosts];
  const duplicates: string[] = [];
  for (const post of allGenerated) {
    const generatedHook = (post.description ?? "").split("\n")[0];

    for (const existing of allExistingTitles) {
      if (textTooSimilar(post.title, existing)) {
        duplicates.push(`Title "${post.title}" is too similar to existing: "${existing}"`);
        break;
      }
    }

    for (const existingHook of allExistingHooks) {
      if (existingHook.length > 10 && textTooSimilar(generatedHook, existingHook, 0.6)) {
        duplicates.push(`Caption hook "${generatedHook.slice(0, 60)}…" is too similar to an existing post's hook`);
        break;
      }
    }

    for (const existingDesc of allExistingDescriptions) {
      if (existingDesc.length > 40 && descriptionTooSimilar(post.description ?? "", existingDesc)) {
        duplicates.push(`Caption body for "${post.title}" is too similar to an existing post's caption`);
        break;
      }
    }
  }
  if (duplicates.length > 0) {
    return NextResponse.json(
      { error: `Generated content too similar to existing posts. Try again — Claude will pick different angles.\n\nConflicts:\n${duplicates.join("\n")}` },
      { status: 409 }
    );
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
