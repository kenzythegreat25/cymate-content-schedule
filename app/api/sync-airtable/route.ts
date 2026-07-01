import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";

const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_URL      = "https://api.airtable.com/v0/appAv2zeXuX7yGrEe/tbld3Iw1TPiIKRlv9";

export async function POST() {
  if (!AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
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

  const records = posts.map((p) => {
    const fields: Record<string, string> = {
      "Title":  p.title ?? "",
      "Status": p.status ?? "",
    };
    if (p.date)             fields["Date"]              = p.date;
    if (p.on_screen_text)   fields["On Screen Text"]    = p.on_screen_text;
    if (p.description)      fields["Description"]       = p.description;
    if (p.platforms?.length) (fields as Record<string, unknown>)["Platform"] = p.platforms as string[];
    if (p.content_type)     fields["Content Type"]      = p.content_type;
    if (p.performance_score) fields["Performance Score"] = p.performance_score;
    if (p.notes)            fields["Notes"]             = p.notes;
    return { fields };
  });

  let totalSynced = 0;
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await fetch(AIRTABLE_URL,
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
