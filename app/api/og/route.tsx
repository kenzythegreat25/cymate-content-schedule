import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function platformColor(platform: string): string {
  if (platform === "LinkedIn") return "#0A66C2";
  if (platform === "Instagram") return "#E1306C";
  if (platform === "Youtube")   return "#FF0000";
  if (platform === "TikTok")    return "#010101";
  if (platform === "Facebook")  return "#1877F2";
  return "#6366f1";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";

  let title = "Content for review";
  let platform = "Cymate";
  let contentType = "";
  let date = "";

  if (token && SUPABASE_URL && SERVICE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data } = await supabase
        .from("posts")
        .select("title, platforms, content_type, date")
        .eq("share_token", token)
        .single();
      if (data) {
        title = data.title || title;
        platform = Array.isArray(data.platforms) && data.platforms[0] ? data.platforms[0] : "Cymate";
        contentType = data.content_type || "";
        date = data.date
          ? new Date(data.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : "";
      }
    } catch { /* fall through to defaults */ }
  }

  const accent = platformColor(platform);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#0f0f12",
          padding: "64px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div style={{ display: "flex", width: "48px", height: "4px", background: accent, borderRadius: "2px", marginBottom: "40px" }} />

        {/* Platform + type chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              borderRadius: "999px",
              background: `${accent}22`,
              border: `1px solid ${accent}55`,
              color: accent,
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            {platform}{contentType ? ` · ${contentType}` : ""}
          </div>
          {date && (
            <div
              style={{
                display: "flex",
                padding: "6px 16px",
                borderRadius: "999px",
                background: "#ffffff10",
                border: "1px solid #ffffff18",
                color: "#888",
                fontSize: "14px",
              }}
            >
              {date}
            </div>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 60 ? "40px" : "52px",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.15,
            maxWidth: "900px",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "#0f0f12",
              letterSpacing: "-0.02em",
            }}
          >
            CS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#ffffff" }}>Cymate</div>
            <div style={{ fontSize: "12px", color: "#555" }}>Shared for review</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
