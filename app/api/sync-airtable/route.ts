import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";

export const maxDuration = 60;

const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_URL      = "https://api.airtable.com/v0/appAv2zeXuX7yGrEe/tbld3Iw1TPiIKRlv9";

function fetchWithTimeout(url: string, options: RequestInit, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

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

  // Only these platform values exist in Airtable
  const VALID_PLATFORMS = new Set(["LinkedIn", "Instagram", "Youtube"]);

  // Only sync Posted content
  const postedPosts = posts.filter((p) => p.status === "Posted");
  if (!postedPosts.length) return NextResponse.json({ synced: 0 });

  // Fetch existing Airtable titles to avoid duplicates
  const existingRes = await fetchWithTimeout(
    `${AIRTABLE_URL}?fields[]=Title&pageSize=100`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
  );
  const existingBody = existingRes.ok
    ? (await existingRes.json() as { records: { fields: { Title?: string } }[] })
    : { records: [] };
  const existingTitles = new Set(
    existingBody.records.map((r) => r.fields.Title ?? "").filter(Boolean)
  );

  const filtered = postedPosts.filter(
    (p) => !existingTitles.has(p.title ?? "")
  );
  if (!filtered.length) return NextResponse.json({ synced: 0, skipped: postedPosts.length });

  const records = filtered.map((p) => {
    const fields: Record<string, unknown> = {
      "Title":  p.title ?? "",
      "Status": "Posted",
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

  const results = await Promise.all(
    records.map((record) =>
      fetchWithTimeout(AIRTABLE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [record] }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(JSON.stringify(body));
        }
        return res.json() as Promise<{ records: unknown[] }>;
      })
    )
  ).catch((err: Error) =>
    NextResponse.json({ error: err.message }, { status: 500 })
  );

  if (!Array.isArray(results)) return results;
  const totalSynced = results.reduce((sum, r) => sum + r.records.length, 0);
  return NextResponse.json({ synced: totalSynced });
}
