import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const SITE_URL = "https://content-schedule-studio.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Content Studio — the calmer way to plan what you post",
    template: "%s · Content Studio",
  },
  description:
    "Board, calendar, and list — three views over one workspace. From raw idea to performance recap, in one place. Free for solo creators.",
  applicationName: "Content Studio",
  keywords: [
    "content calendar",
    "social media scheduler",
    "content planning",
    "creator tools",
    "kanban content board",
  ],
  authors: [{ name: "Cymate" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Content Studio",
    title: "Content Studio — the calmer way to plan what you post",
    description:
      "Board, calendar, and list — three views over one workspace. From raw idea to performance recap, in one place.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Content Studio — the calmer way to plan what you post",
    description:
      "Board, calendar, and list — three views over one workspace. From raw idea to performance recap, in one place.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
