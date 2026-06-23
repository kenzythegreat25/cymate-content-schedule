import type { ContentItem, ContentType, Platform, ReviewStatus, Status } from "./types";
import { supabaseBrowser } from "./supabase/client";

type Row = {
  id: string;
  user_id: string;
  title: string;
  date: string | null;
  on_screen_text: string | null;
  description: string | null;
  platforms: string[] | null;
  attachments: string | null;
  attachment_urls: string[] | null;
  status: string;
  content_type: string | null;
  performance_score: string | null;
  notes: string | null;
  review_status: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  slides: string[] | null;
  share_token: string | null;
  created_at: string;
};

function fromRow(r: Row): ContentItem {
  const fromArray = Array.isArray(r.attachment_urls) ? r.attachment_urls.filter(Boolean) : [];
  const legacy = r.attachments && r.attachments.trim() ? [r.attachments.trim()] : [];
  return {
    id: r.id,
    title: r.title ?? "",
    date: r.date ?? "",
    onScreenText: r.on_screen_text ?? "",
    description: r.description ?? "",
    platforms: (r.platforms ?? []) as Platform[],
    attachments: fromArray.length ? fromArray : legacy,
    status: (r.status as Status) ?? "Idea",
    contentType: (r.content_type ?? "") as ContentType | "",
    performanceScore: r.performance_score ?? "",
    notes: r.notes ?? "",
    createdAt: new Date(r.created_at).getTime(),
    reviewStatus: (r.review_status ?? "") as ReviewStatus,
    reviewNote: r.review_note ?? "",
    reviewedBy: r.reviewed_by ?? "",
    reviewedAt: r.reviewed_at ?? "",
    slides: Array.isArray(r.slides) ? r.slides : [],
    shareToken: r.share_token ?? "",
  };
}

function toRow(item: Partial<ContentItem>): Partial<Row> {
  const row: Partial<Row> = {};
  if (item.title !== undefined) row.title = item.title;
  if (item.date !== undefined) row.date = item.date || null;
  if (item.onScreenText !== undefined) row.on_screen_text = item.onScreenText;
  if (item.description !== undefined) row.description = item.description;
  if (item.platforms !== undefined) row.platforms = item.platforms;
  if (item.attachments !== undefined) {
    row.attachment_urls = item.attachments;
    // Keep legacy text column in sync with the first attachment so older deploys still see something.
    row.attachments = item.attachments[0] ?? "";
  }
  if (item.status !== undefined) row.status = item.status;
  if (item.contentType !== undefined) row.content_type = item.contentType || null;
  if (item.performanceScore !== undefined) row.performance_score = item.performanceScore;
  if (item.notes !== undefined) row.notes = item.notes;
  if (item.reviewStatus !== undefined) row.review_status = item.reviewStatus || null;
  if (item.reviewNote !== undefined) row.review_note = item.reviewNote;
  if (item.reviewedBy !== undefined) row.reviewed_by = item.reviewedBy || null;
  if (item.reviewedAt !== undefined) row.reviewed_at = item.reviewedAt || null;
  if (item.slides !== undefined) row.slides = item.slides;
  if (item.shareToken !== undefined) row.share_token = item.shareToken || null;
  return row;
}

export async function ensureShareToken(postId: string, existing: string): Promise<string | null> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("posts").update({ share_token: token }).eq("id", postId);
  if (error) {
    console.error("ensureShareToken error", error);
    return null;
  }
  return token;
}

export async function listPosts(): Promise<ContentItem[]> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listPosts error", error);
    return [];
  }
  return (data as Row[]).map(fromRow);
}

export async function createPost(input: Partial<ContentItem>): Promise<ContentItem | null> {
  const supabase = supabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const row = { ...toRow(input), user_id: userData.user.id, status: input.status ?? "Idea", title: input.title ?? "" };
  const { data, error } = await supabase.from("posts").insert(row).select().single();
  if (error) {
    console.error("createPost error", error);
    return null;
  }
  return fromRow(data as Row);
}

export async function updatePost(id: string, patch: Partial<ContentItem>): Promise<void> {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("posts").update(toRow(patch)).eq("id", id);
  if (error) console.error("updatePost error", error);
}

export async function deletePost(id: string): Promise<void> {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) console.error("deletePost error", error);
}

export type UploadedMedia = { url: string; name: string; type: string; size: number };

export async function uploadMedia(file: File, postId: string): Promise<UploadedMedia | null> {
  const supabase = supabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  const path = `${userData.user.id}/${postId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });

  if (error) {
    console.error("uploadMedia error", error);
    return null;
  }

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: file.type, size: file.size };
}

export async function removeMedia(url: string): Promise<void> {
  const supabase = supabaseBrowser();
  // Public URL pattern: .../storage/v1/object/public/post-images/<path>
  const marker = "/post-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length).split("?")[0];
  const { error } = await supabase.storage.from("post-images").remove([path]);
  if (error) console.error("removeMedia error", error);
}

// Helpers used by the UI to render previews + downloads.

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|ogg)(\?|$)/i.test(url);
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}

export function downloadUrl(url: string, filename?: string): string {
  const sep = url.includes("?") ? "&" : "?";
  const name = filename ? encodeURIComponent(filename) : "true";
  return `${url}${sep}download=${name}`;
}

export function basenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const last = decodeURIComponent(parts[parts.length - 1] || "file");
    return last.replace(/^\d+-/, "");
  } catch {
    return "file";
  }
}
