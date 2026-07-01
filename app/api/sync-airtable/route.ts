import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";

const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_BASE_ID  = process.env.AIRTABLE_BASE_ID || "appAv2zeXuX7yGrEe";
const AIRTABLE_TABLE    = "tbld3Iw1TPiIKRlv9";

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
      "Title":             p.title ?? "",
      "Date":              p.date ?? "",
      "On Screen Text":    p.on_screen_text ?? "",
      "Description":       p.description ?? "",
      "Platform":          (p.platforms ?? []).join(", "),
      "Status":            p.status ?? "",
      "Content Type":      p.content_type ?? "",
      "Performance Score": p.performance_score ?? "",
      "Notes":             p.notes ?? "",
    },
  }));

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE}`;
  console.log("Airtable URL:", url);
  console.log("API Key prefix:", AIRTABLE_API_KEY.slice(0, 10));
  console.log("Records to sync:", records.length);

  let totalSynced = 0;
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await fetch(url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: chunk }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ error: JSON.stringify(body), status: res.status }, { status: 500 });
    }

    const body = await res.json() as { records: unknown[] };
    totalSynced += body.records.length;
  }

  return NextResponse.json({ synced: totalSynced });
}
