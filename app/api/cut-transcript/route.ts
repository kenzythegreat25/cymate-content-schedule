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

  const prompt = `You are a content strategist for Cymate — a B2B cold email and outbound agency. Your job is to find the ${clipCount} best short-form video clips from this transcript that are worth posting as standalone social content.

CYMATE'S CONTENT PILLARS (only cut clips relevant to these):
- Cold email strategy, deliverability, sequences, copywriting
- Outbound sales and lead generation for B2B companies
- Client results: meetings booked, reply rates, campaign performance
- Common mistakes agencies and founders make with outbound
- Mindset and frameworks for building a sales pipeline
- Behind-the-scenes of running an outbound agency

CLIP SELECTION RULES — apply all of these strictly:
1. VERBATIM ONLY — extract the clip exactly as spoken. Do not rephrase, rewrite, or paraphrase a single word. The excerpt must be the original text from the transcript, word for word.
2. STANDALONE — the clip must make complete sense to someone who has never seen the rest of the video. No "as I mentioned earlier", no dangling context.
3. Q&A HANDLING — if the clip starts with a question from someone, include the question and the full answer as one clip. Never start a clip mid-answer without including the question that prompted it.
4. IMMEDIATE CLARITY — the very first sentence of the clip must tell the viewer exactly what the topic is. If someone watches the first 3 seconds and can't tell what it's about, it's the wrong starting point.
5. CONCRETE POINT — every clip must contain a specific insight, result, framework, or contrarian take. Skip transitions, intros, outros, small talk, and any moment that is vague or generic.
6. NO REPETITION — each clip must cover a distinctly different idea. Do not cut two clips that make the same point.
7. LENGTH — each clip should be ${lengthGuide} of spoken content.
8. RELEVANCE FIRST — if you cannot find ${clipCount} truly relevant clips, return fewer. Never pad with weak content just to hit the number.

For each clip, return:
- title: A clear, specific title that tells the viewer exactly what the clip is about (not clickbait, just clear)
- excerpt: The verbatim text from the transcript for this clip — exact words, nothing changed
- estimatedDuration: Estimated spoken duration (e.g. "~45 sec", "~2 min")
- description: A ready-to-post caption for LinkedIn or Instagram. Written in first person. No URLs. If there's a booking CTA, say "Booking link in the comments." If linking to something, say "Link in the comments." No em dashes.
- why: One sentence explaining why this clip meets the selection criteria (internal use, not shown publicly)

Respond ONLY with valid JSON in this exact format:
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
