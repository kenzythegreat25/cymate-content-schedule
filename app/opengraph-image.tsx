import { ImageResponse } from "next/og";

export const alt = "Content Studio — the calmer way to plan what you post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f7f5f0",
          color: "#1a1614",
          fontFamily: "serif",
          position: "relative",
        }}
      >
        {/* Soft accent blobs */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: "rgba(109,40,217,0.18)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            right: -160,
            width: 460,
            height: 460,
            borderRadius: 9999,
            background: "rgba(245,158,11,0.15)",
            filter: "blur(80px)",
          }}
        />

        {/* Top bar — brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "sans-serif" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#1a1614",
              color: "#f7f5f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
              fontFamily: "sans-serif",
              letterSpacing: -1,
            }}
          >
            CS
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5 }}>Cymate</div>
            <div style={{ fontSize: 18, color: "#8a827a" }}>Content Studio</div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "sans-serif",
              fontSize: 18,
              color: "#5b534d",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: "#10b981" }} />
            Three views, one workspace
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 112,
              lineHeight: 1.02,
              letterSpacing: -3,
              maxWidth: 980,
            }}
          >
            <span>The calmer way to plan&nbsp;</span>
            <span style={{ color: "#6d28d9", fontStyle: "italic" }}>what you post.</span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#5b534d",
              maxWidth: 860,
              fontFamily: "sans-serif",
              lineHeight: 1.4,
            }}
          >
            Board, calendar, and list — from raw idea to performance recap, in one place.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "sans-serif",
            fontSize: 22,
            color: "#5b534d",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#a78bfa" }} />
              <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#f59e0b" }} />
              <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#0ea5e9" }} />
              <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#10b981" }} />
            </div>
            <span>Idea → Drafting → Scheduled → Posted</span>
          </div>
          <div style={{ color: "#1a1614", fontWeight: 600 }}>
            content-schedule-studio.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
