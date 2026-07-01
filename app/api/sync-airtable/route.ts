import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";

const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_BASE_ID  = process.env.AIRTABLE_BASE_ID ?? "";
const AIRTABLE_TABLE    = process.env.AIRTABLE_TABLE_NAME ?? "Content Schedule";

export async function POST() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: "Airtable env vars not set." }, { status: 500 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: posts, error: dbError } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!posts?.length) return NextResponse.json({ synced: 0 });

  const records = posts.map((p) => ({
    fields: {
      "Post ID":           p.id,
      "Title":             p.title ?? "",
      "Date":              p.date ?? "",
      "On Screen Text":    p.on_screen_text ?? "",
      "Description":       p.description ?? "",
      "Platform":          p.platforms ?? [],
      "Status":            p.status ?? "",
      "Content Type":      p.content_type ?? "",
      "Performance Score": p.performance_score ?? "",
      "Notes":             p.notes ?? "",
      "Attachments": (p.attachment_urls ?? [])
        .filter(Boolean)
        .map((url: string) => ({ url })),
    },
  }));

  let totalSynced = 0;
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
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
      return NextResponse.json(
        { error: (body as { error?: { message?: string } }).error?.message ?? `Airtable error ${res.status}` },
        { status: 500 }
      );
    }

    const body = await res.json() as { records: unknown[] };
    totalSynced += body.records.length;
  }

  return NextResponse.json({ synced: totalSynced });
}
