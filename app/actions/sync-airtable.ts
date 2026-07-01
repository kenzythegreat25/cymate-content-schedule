"use server";

import { supabaseServer } from "../../lib/supabase/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID ?? "";
const AIRTABLE_TABLE   = process.env.AIRTABLE_TABLE_NAME ?? "Content Schedule";

// Airtable upsert: match on "Post ID" field so re-running won't create duplicates.
// You must add a single-line "Post ID" text field to your Airtable table.
export async function syncToAirtable(): Promise<{ synced: number; error?: string }> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return { synced: 0, error: "AIRTABLE_API_KEY or AIRTABLE_BASE_ID not set in environment." };
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { synced: 0, error: "Not authenticated." };

  const { data: posts, error: dbError } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (dbError) return { synced: 0, error: dbError.message };
  if (!posts?.length) return { synced: 0 };

  const records = posts.map((p) => ({
    fields: {
      "Post ID":          p.id,
      "Title":            p.title ?? "",
      "Date":             p.date ?? "",
      "On Screen Text":   p.on_screen_text ?? "",
      "Description":      p.description ?? "",
      "Platform":         (p.platforms ?? []),
      "Status":           p.status ?? "",
      "Content Type":     p.content_type ?? "",
      "Performance Score":p.performance_score ?? "",
      "Notes":            p.notes ?? "",
      // Attachments: Airtable expects [{url: "..."}]
      "Attachments": (p.attachment_urls ?? [])
        .filter(Boolean)
        .map((url: string) => ({ url })),
    },
  }));

  // Airtable allows max 10 records per request
  const chunks: typeof records[] = [];
  for (let i = 0; i < records.length; i += 10) {
    chunks.push(records.slice(i, i + 10));
  }

  let totalSynced = 0;
  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: chunk,
          performUpsert: { fieldsToMergeOn: ["Post ID"] },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        synced: totalSynced,
        error: (body as { error?: { message?: string } }).error?.message ?? `Airtable API error ${res.status}`,
      };
    }

    const body = await res.json() as { records: unknown[] };
    totalSynced += body.records.length;
  }

  return { synced: totalSynced };
}
