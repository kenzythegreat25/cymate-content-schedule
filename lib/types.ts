export type Platform = "LinkedIn" | "Instagram" | "Youtube" | "TikTok" | "X" | "Facebook";
export type Status = "Idea" | "Review" | "Drafting" | "Scheduled" | "Posted" | "Archived";
export type ContentType = "Text" | "Carousel" | "Static" | "Short-Form Video" | "Long-Form Video" | "Reel" | "Story" | "Feedback";
export type ReviewStatus = "" | "pending" | "approved" | "needs-revision" | "on-hold";

export const PLATFORMS: Platform[] = ["LinkedIn", "Instagram", "Youtube", "TikTok", "X", "Facebook"];
export const STATUSES: Status[] = ["Drafting", "Review", "Scheduled", "Posted", "Archived"];
export const CONTENT_TYPES: ContentType[] = [
  "Text",
  "Carousel",
  "Static",
  "Short-Form Video",
  "Long-Form Video",
  "Reel",
  "Story",
  "Feedback",
];

export type ContentItem = {
  id: string;
  title: string;
  date: string;
  onScreenText: string;
  description: string;
  platforms: Platform[];
  attachments: string[];
  status: Status;
  contentType: ContentType | "";
  performanceScore: string;
  notes: string;
  createdAt: number;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string;
  slides: string[];
  shareToken: string;
};

export const emptyItem = (): ContentItem => ({
  id: crypto.randomUUID(),
  title: "",
  date: "",
  onScreenText: "",
  description: "",
  platforms: [],
  attachments: [],
  status: "Drafting",
  contentType: "",
  performanceScore: "",
  notes: "",
  createdAt: Date.now(),
  reviewStatus: "",
  reviewNote: "",
  reviewedBy: "",
  reviewedAt: "",
  slides: [],
  shareToken: "",
});

export const STATUS_META: Record<Status, { dot: string; tint: string; text: string; ring: string; label: string }> = {
  Idea:      { dot: "bg-violet-500",  tint: "bg-violet-50",   text: "text-violet-700",  ring: "ring-violet-100",  label: "Idea" },
  Review:    { dot: "bg-orange-500",  tint: "bg-orange-50",   text: "text-orange-700",  ring: "ring-orange-100",  label: "Review" },
  Drafting:  { dot: "bg-amber-500",   tint: "bg-amber-50",    text: "text-amber-700",   ring: "ring-amber-100",   label: "Drafting" },
  Scheduled: { dot: "bg-sky-500",     tint: "bg-sky-50",      text: "text-sky-700",     ring: "ring-sky-100",     label: "Scheduled" },
  Posted:    { dot: "bg-emerald-500", tint: "bg-emerald-50",  text: "text-emerald-700", ring: "ring-emerald-100", label: "Posted" },
  Archived:  { dot: "bg-stone-400",   tint: "bg-stone-100",   text: "text-stone-600",   ring: "ring-stone-200",   label: "Archived" },
};

export const REVIEW_STATUS_META: Record<Exclude<ReviewStatus, "">, { label: string; tint: string; text: string; ring: string; dot: string }> = {
  pending:         { label: "Awaiting review",  tint: "bg-orange-50",   text: "text-orange-700",   ring: "ring-orange-100",   dot: "bg-orange-500" },
  approved:        { label: "Approved",         tint: "bg-emerald-50",  text: "text-emerald-700",  ring: "ring-emerald-100",  dot: "bg-emerald-500" },
  "needs-revision":{ label: "Needs revision",   tint: "bg-rose-50",     text: "text-rose-700",     ring: "ring-rose-100",     dot: "bg-rose-500" },
  "on-hold":       { label: "On hold",          tint: "bg-slate-100",   text: "text-slate-700",    ring: "ring-slate-200",    dot: "bg-slate-500" },
};

export const PLATFORM_META: Record<Platform, { color: string; bg: string }> = {
  LinkedIn:  { color: "#0a66c2", bg: "#e8f1fb" },
  Instagram: { color: "#d6249f", bg: "#fde7f3" },
  Youtube:   { color: "#cc0000", bg: "#fde6e6" },
  TikTok:    { color: "#111111", bg: "#ececec" },
  X:         { color: "#111111", bg: "#ececec" },
  Facebook:  { color: "#1877f2", bg: "#e7f0fe" },
};

export const CONTENT_TYPE_META: Record<ContentType, { tint: string; text: string; ring: string }> = {
  Text:               { tint: "bg-sky-100",      text: "text-sky-800",      ring: "ring-sky-200" },
  Carousel:           { tint: "bg-pink-100",     text: "text-pink-800",     ring: "ring-pink-200" },
  Static:             { tint: "bg-amber-100",    text: "text-amber-800",    ring: "ring-amber-200" },
  "Short-Form Video": { tint: "bg-slate-700",    text: "text-slate-50",     ring: "ring-slate-600" },
  "Long-Form Video":  { tint: "bg-indigo-700",   text: "text-indigo-50",    ring: "ring-indigo-600" },
  Reel:               { tint: "bg-rose-700",     text: "text-rose-50",      ring: "ring-rose-600" },
  Story:              { tint: "bg-fuchsia-100",  text: "text-fuchsia-800",  ring: "ring-fuchsia-200" },
  Feedback:           { tint: "bg-emerald-700",  text: "text-emerald-50",   ring: "ring-emerald-600" },
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
