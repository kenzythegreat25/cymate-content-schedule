import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 14,
          fontSize: 44,
          fontWeight: 700,
          fontFamily: "serif",
          letterSpacing: -2,
        }}
      >
        V
      </div>
    ),
    { ...size }
  );
}
