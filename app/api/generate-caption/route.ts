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

  const { imageUrl, platform, contentType, description: userDescription } = await req.json() as {
    imageUrl: string;
    platform: string;
    contentType: string;
    description?: string;
  };

  if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });

  const isVideo = /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(imageUrl);
  const isDriveFolder = imageUrl.includes("drive.google.com/drive/folders") || imageUrl.includes("drive.google.com/open");

  const captionPromptText = (context: string) => `You are writing social media content for Cymate, a B2B cold email outbound agency targeting founders, sales leaders, and GTM teams at tech/SaaS companies.

${context}

Write a caption for a ${contentType || "post"} on ${platform || "Instagram"}.

Caption rules:
- Line 1: Strong hook — one punchy sentence directly related to the media or topic
- Blank line
- 2-3 short value lines — one idea per line, max 10 words each
- Blank line
- Save nudge — e.g. "Save this before your next campaign."
- Blank line
- Interactive question — ask the reader something specific and direct related to the topic
- Blank line
- Soft CTA — e.g. "Link in bio for more." or "Visit cymate.io for the full breakdown."
- Blank line
- 5 relevant hashtags from: #B2BOutbound #ColdEmail #LeadGeneration #OutboundSales #GTMStrategy #SalesProspecting #B2BSales #SalesDevelopment #RevenueGrowth #EmailOutreach #OutboundMarketing #B2BMarketing #SalesStrategy #PipelineGeneration #BookMoreMeetings #SDR #SalesLeadership #StartupGrowth #GrowthStrategy #DemandGeneration

Rules: No em dashes. Professional but human. No emojis. Short lines, not paragraphs.

Return only the caption text. No explanation, no labels.`;

  let messageContent: unknown[];
  let isFallback = false;

  // If user provided a description (fallback path) or it's a folder/non-fetchable link
  if (userDescription) {
    isFallback = false;
    messageContent = [{ type: "text", text: captionPromptText(`The media shows: ${userDescription}`) }];
  } else if (isVideo || isDriveFolder) {
    messageContent = [{ type: "text", text: captionPromptText(`The post is a ${isVideo ? "video" : "media folder"} attachment. Generate a caption that works for outbound/cold email content.`) }];
  } else {
    // Fetch image and convert to base64
    let base64: string;
    let mediaType: string;
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
      if (!imgRes.ok) throw new Error(`Failed to fetch: ${imgRes.status}`);
      const contentTypeHeader = imgRes.headers.get("content-type") ?? "";
      // If response is not an image (e.g. Drive HTML redirect page), fall back
      if (!contentTypeHeader.startsWith("image/")) throw new Error("Not a direct image");
      const buffer = await imgRes.arrayBuffer();
      base64 = Buffer.from(buffer).toString("base64");
      mediaType = contentTypeHeader.split(";")[0].trim();
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
        mediaType = "image/jpeg";
      }
    } catch {
      // Can't fetch the image — return fallback signal so UI can ask for description
      return NextResponse.json({ caption: "", fallback: true });
    }

    messageContent = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text: captionPromptText("Look at this image and write a caption based on what you see."),
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
    return NextResponse.json({ caption, fallback: isFallback });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
