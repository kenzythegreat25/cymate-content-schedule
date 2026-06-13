import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1614",
          color: "#f7f5f0",
          fontSize: 90,
          fontWeight: 700,
          fontFamily: "sans-serif",
          letterSpacing: -4,
        }}
      >
        CS
      </div>
    ),
    { ...size }
  );
}
