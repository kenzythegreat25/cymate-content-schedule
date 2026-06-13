export type Platform = "LinkedIn" | "Instagram" | "Youtube" | "TikTok" | "X" | "Facebook";
export type Status = "Idea" | "Drafting" | "Scheduled" | "Posted" | "Archived";

export const PLATFORMS: Platform[] = ["LinkedIn", "Instagram", "Youtube", "TikTok", "X", "Facebook"];
export const STATUSES: Status[] = ["Idea", "Drafting", "Scheduled", "Posted", "Archived"];

export type ContentItem = {
  id: string;
  title: string;
  date: string;
  onScreenText: string;
  description: string;
  platforms: Platform[];
  attachments: string;
  status: Status;
  performanceScore: string;
  notes: string;
  createdAt: number;
};

export const emptyItem = (): ContentItem => ({
  id: crypto.randomUUID(),
  title: "",
  date: "",
  onScreenText: "",
  description: "",
  platforms: [],
  attachments: "",
  status: "Idea",
  performanceScore: "",
  notes: "",
  createdAt: Date.now(),
});

export const STATUS_META: Record<Status, { dot: string; tint: string; text: string; ring: string; label: string }> = {
  Idea:      { dot: "bg-violet-500",  tint: "bg-violet-50",   text: "text-violet-700",  ring: "ring-violet-100",  label: "Idea" },
  Drafting:  { dot: "bg-amber-500",   tint: "bg-amber-50",    text: "text-amber-700",   ring: "ring-amber-100",   label: "Drafting" },
  Scheduled: { dot: "bg-sky-500",     tint: "bg-sky-50",      text: "text-sky-700",     ring: "ring-sky-100",     label: "Scheduled" },
  Posted:    { dot: "bg-emerald-500", tint: "bg-emerald-50",  text: "text-emerald-700", ring: "ring-emerald-100", label: "Posted" },
  Archived:  { dot: "bg-stone-400",   tint: "bg-stone-100",   text: "text-stone-600",   ring: "ring-stone-200",   label: "Archived" },
};

export const PLATFORM_META: Record<Platform, { color: string; bg: string }> = {
  LinkedIn:  { color: "#0a66c2", bg: "#e8f1fb" },
  Instagram: { color: "#d6249f", bg: "#fde7f3" },
  Youtube:   { color: "#cc0000", bg: "#fde6e6" },
  TikTok:    { color: "#111111", bg: "#ececec" },
  X:         { color: "#111111", bg: "#ececec" },
  Facebook:  { color: "#1877f2", bg: "#e7f0fe" },
};

// Approximate caption character limits per platform
export const PLATFORM_LIMITS: Record<Platform, number> = {
  X:         280,
  Instagram: 2200,
  TikTok:    2200,
  LinkedIn:  3000,
  Youtube:   5000,
  Facebook:  63206,
};
