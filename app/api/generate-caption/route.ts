import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(req: Request) {
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { imageUrl, platform, contentType } = await req.json() as {
    imageUrl: string;
    platform: string;
    contentType: string;
  };

  if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });

  const isVideo = /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(imageUrl);

  let messageContent: unknown[];

  if (isVideo) {
    messageContent = [{
      type: "text",
      text: `Generate a caption for a ${contentType || "video"} post on ${platform || "Instagram"} for Cymate, a B2B cold email outbound agency. The post is a video attachment. Write a caption that feels natural, has a strong hook on the first line, adds value, includes a save nudge, ends with an interactive question for the audience, and closes with a soft CTA. Keep it concise and punchy — short lines, not a wall of text. No em dashes. Professional but human tone. Return only the caption text, nothing else.`,
    }];
  } else {
    // Fetch image and convert to base64
    let base64: string;
    let mediaType: string;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const buffer = await imgRes.arrayBuffer();
      base64 = Buffer.from(buffer).toString("base64");
      mediaType = imgRes.headers.get("content-type") ?? "image/jpeg";
      // Clamp to supported types
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
        mediaType = "image/jpeg";
      }
    } catch (e) {
      return NextResponse.json({ error: `Could not fetch image: ${String(e)}` }, { status: 400 });
    }

    messageContent = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text: `You are writing social media content for Cymate, a B2B cold email outbound agency targeting founders, sales leaders, and GTM teams at tech/SaaS companies.

Look at this image and write a caption for a ${contentType || "post"} on ${platform || "Instagram"}.

Caption rules:
- Line 1: Strong hook — one punchy sentence directly related to what the image shows or the message it conveys
- Blank line
- 2-3 short value lines — one idea per line, max 10 words each
- Blank line
- Save nudge — e.g. "Save this before your next campaign."
- Blank line
- Interactive question — ask the reader something specific and direct related to the image or topic
- Blank line
- Soft CTA — e.g. "Link in bio for more." or "Visit cymate.io for the full breakdown."
- Blank line
- 5 relevant hashtags from: #B2BOutbound #ColdEmail #LeadGeneration #OutboundSales #GTMStrategy #SalesProspecting #B2BSales #SalesDevelopment #RevenueGrowth #EmailOutreach #OutboundMarketing #B2BMarketing #SalesStrategy #PipelineGeneration #BookMoreMeetings #SDR #SalesLeadership #StartupGrowth #GrowthStrategy #DemandGeneration

Rules: No em dashes. Professional but human. No emojis. Short lines, not paragraphs.

Return only the caption text. No explanation, no labels.`,
      },
    ];
  }

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
        max_tokens: 600,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      return NextResponse.json({ error: `Claude API ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json() as { content: { text: string }[] };
    const caption = data.content[0].text.trim();
    return NextResponse.json({ caption });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
