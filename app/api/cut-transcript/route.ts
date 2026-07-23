import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";

export const maxDuration = 60;

const ALLOWED_EMAIL  = "kenc@cymate.io";
const ANTHROPIC_URL  = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY ?? "";

async function authCheck() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ALLOWED_EMAIL ? user : null;
}

export async function POST(req: Request) {
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set." }, { status: 500 });
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    transcript?: string;
    clipCount?: number;
    lengths?: string[];
  };

  const { transcript = "", clipCount = 10, lengths = ["60–90s"] } = body;
  if (!transcript.trim()) return NextResponse.json({ error: "No transcript provided." }, { status: 400 });

  const lengthLabel = lengths.join(", ");
  const lengthGuide = lengths.map((l) => {
    if (l === "30–60s") return "short (30–60 seconds of spoken content, roughly 75–150 words)";
    if (l === "60–90s") return "medium (60–90 seconds of spoken content, roughly 150–225 words)";
    if (l === "3–10min") return "long (3–10 minutes of spoken content, roughly 450–1500 words)";
    return l;
  }).join(" or ");

  const prompt = `You are a content strategist for Cymate — a B2B cold email and outbound agency. You have just been handed the transcript below.

STEP 1 — READ AND UNDERSTAND THE FULL TRANSCRIPT BEFORE DOING ANYTHING ELSE.
Read the entire transcript from start to finish as if you are watching the video yourself. Understand:
- Who is speaking and what is the overall topic of the conversation
- What is the narrative arc — how does the discussion develop from start to finish
- What are the 3-5 core themes the speakers keep coming back to
- Which specific moments have a complete, self-contained idea that would land for someone who never sees the rest of the video
- Which moments are just transitions, filler, or only make sense in context of something said earlier

If after reading the full transcript you cannot clearly describe what the video is about in 2 sentences, do not guess — return an empty clips array with an error message in a top-level "error" field explaining that the transcript is unclear or off-topic.

STEP 2 — SELECT CLIPS BASED ON YOUR FULL UNDERSTANDING.
Only after understanding the whole video, select the ${clipCount} strongest moments to cut as short-form clips. Use your understanding of the full context to pick moments that represent the best, most self-contained ideas in the video.

CYMATE'S CONTENT PILLARS — only cut clips relevant to these:
- Cold email strategy, deliverability, sequences, copywriting
- Outbound sales and lead generation for B2B companies
- Client results: meetings booked, reply rates, campaign performance
- Common mistakes agencies and founders make with outbound
- Mindset and frameworks for building a sales pipeline
- Behind-the-scenes of running an outbound agency

CLIP SELECTION RULES — all must pass:
1. VERBATIM ONLY — the excerpt must be the exact words from the transcript. Zero rewrites. Zero paraphrasing. If you change even one word, the clip is invalid.
2. FULL UNDERSTANDING REQUIRED — you must have read the whole video to know this moment is truly one of the best, not just one that sounds good out of context.
3. STANDALONE — the clip makes complete sense to someone who has never seen anything else from this video. No references to "what I said earlier" or other dangling context.
4. Q&A HANDLING — if the clip starts mid-answer to a question, go back and include the question first. Never start a clip without the setup that triggered it.
5. IMMEDIATE CLARITY — the very first sentence tells the viewer exactly what the topic is. If someone watches the first 3 seconds and cannot tell what it is about, find a better starting point in the transcript.
6. CONCRETE POINT — specific insight, result, framework, or contrarian take. No filler, no transitions, no vague advice that applies to everything.
7. NO REPETITION — each clip covers a distinctly different idea. Never cut two clips making the same point.
8. LENGTH — each clip should be ${lengthGuide} of spoken content.
9. QUALITY OVER COUNT — if you cannot find ${clipCount} clips that genuinely pass all the above, return fewer. Never pad with weak clips just to hit the number.

STEP 3 — RETURN JSON.
For each clip return:
- title: Clear, specific, no clickbait — tells the viewer exactly what the clip is about
- excerpt: Verbatim text from the transcript, word for word, nothing changed
- estimatedDuration: Estimated spoken duration (e.g. "~45 sec", "~2 min")
- description: Ready-to-post caption for LinkedIn or Instagram. First person. No URLs. Booking CTA = "Booking link in the comments." Other links = "Link in the comments." No em dashes.
- why: One sentence — why this specific moment, based on your understanding of the full video, is one of the best clips to cut

Respond ONLY with valid JSON:
{
  "clips": [
    {
      "title": "...",
      "excerpt": "...",
      "estimatedDuration": "...",
      "description": "...",
      "why": "..."
    }
  ]
}

TRANSCRIPT:
${transcript}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: "You are a JSON-only responder. Always respond with valid, complete JSON and nothing else. Never truncate your response. Never add prose before or after the JSON.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 });
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as { clips: unknown[] };
    return NextResponse.json({ clips: parsed.clips, lengths: lengthLabel });
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response.", raw }, { status: 500 });
  }
}
