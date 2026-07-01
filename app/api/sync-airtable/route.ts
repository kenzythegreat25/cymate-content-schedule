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

  // Map app statuses to Airtable single-select options
  const STATUS_MAP: Record<string, string> = {
    Drafting:  "In progress",
    Scheduled: "In progress",
    Posted:    "Posted",
    Archived:  "Todo",
  };
  // Only these platform values exist in Airtable
  const VALID_PLATFORMS = new Set(["LinkedIn", "Instagram", "Youtube"]);

  const filtered = posts.filter((p) => p.status !== "Review");
  if (!filtered.length) return NextResponse.json({ synced: 0 });

  const records = filtered.map((p) => {
    const fields: Record<string, unknown> = {
      "Title":  p.title ?? "",
      "Status": STATUS_MAP[p.status] ?? "Todo",
    };
    if (p.date)             fields["Date"]              = p.date;
    if (p.on_screen_text)   fields["On Screen Text"]    = p.on_screen_text;
    if (p.description)      fields["Description"]       = p.description;
    const validPlatforms = (p.platforms as string[] ?? []).filter((pl) => VALID_PLATFORMS.has(pl));
    if (validPlatforms.length) fields["Platform"]        = validPlatforms;
    const attachments = (p.attachments as string[] ?? []).map((url) => ({ url }));
    if (attachments.length) fields["Attachments"]        = attachments;
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
