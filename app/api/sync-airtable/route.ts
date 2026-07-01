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
      "Name": p.title ?? "",
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
