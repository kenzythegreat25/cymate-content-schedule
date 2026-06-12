import type { ContentItem, Platform, Status } from "./types";
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
  status: string;
  performance_score: string | null;
  notes: string | null;
  created_at: string;
};

function fromRow(r: Row): ContentItem {
  return {
    id: r.id,
    title: r.title ?? "",
    date: r.date ?? "",
    onScreenText: r.on_screen_text ?? "",
    description: r.description ?? "",
    platforms: (r.platforms ?? []) as Platform[],
    attachments: r.attachments ?? "",
    status: (r.status as Status) ?? "Idea",
    performanceScore: r.performance_score ?? "",
    notes: r.notes ?? "",
    createdAt: new Date(r.created_at).getTime(),
  };
}

function toRow(item: Partial<ContentItem>): Partial<Row> {
  const row: Partial<Row> = {};
  if (item.title !== undefined) row.title = item.title;
  if (item.date !== undefined) row.date = item.date || null;
  if (item.onScreenText !== undefined) row.on_screen_text = item.onScreenText;
  if (item.description !== undefined) row.description = item.description;
  if (item.platforms !== undefined) row.platforms = item.platforms;
  if (item.attachments !== undefined) row.attachments = item.attachments;
  if (item.status !== undefined) row.status = item.status;
  if (item.performanceScore !== undefined) row.performance_score = item.performanceScore;
  if (item.notes !== undefined) row.notes = item.notes;
  return row;
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
