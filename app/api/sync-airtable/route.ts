import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";
import type { ContentItem } from "../../../lib/types";

export const maxDuration = 60;

const AIRTABLE_API_KEY  = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_URL      = "https://api.airtable.com/v0/appAv2zeXuX7yGrEe/tbld3Iw1TPiIKRlv9";
const ALLOWED_EMAIL     = "kenc@cymate.io";
const VALID_PLATFORMS   = new Set(["LinkedIn", "Instagram", "Youtube"]);

function fetchWithTimeout(url: string, options: RequestInit, ms = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

const STATUS_MAP: Record<string, string> = {
  Posted:    "Posted",
  Scheduled: "Scheduled",
  Review:    "In Review",
};

function toAirtableFields(p: ContentItem): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    "Post ID": p.id,
    "Title":   p.title ?? "",
    "Status":  STATUS_MAP[p.status] ?? p.status,
  };
  if (p.date)             fields["Date"]              = p.date;
  if (p.onScreenText)     fields["On Screen Text"]    = p.onScreenText;
  if (p.description)      fields["Description"]       = p.description;
  const platforms = p.platforms.filter((pl) => VALID_PLATFORMS.has(pl));
  if (platforms.length)   fields["Platform"]          = platforms;
  // Only send attachments that are valid non-empty URLs
  const attachments = p.attachments
    .filter((url) => url && url.startsWith("http"))
    .map((url) => ({ url }));
  if (attachments.length) fields["Attachments"]       = attachments;
  if (p.contentType)      fields["Content Type"]      = p.contentType;
  if (p.performanceScore) fields["Performance Score"] = p.performanceScore;
  if (p.notes)            fields["Notes"]             = p.notes;
  return fields;
}

async function authCheck() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ALLOWED_EMAIL ? user : null;
}

// GET — fetch all existing Airtable records, return map of Post ID → Airtable record ID
export async function GET() {
  if (!AIRTABLE_API_KEY) return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const map: Record<string, string> = {};
  let offset: string | undefined;

  do {
    const url = new URL(AIRTABLE_URL);
    url.searchParams.set("fields[]", "Post ID");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 });
    }
    const data = await res.json() as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    for (const record of data.records) {
      const postId = record.fields["Post ID"] as string | undefined;
      if (postId) map[postId] = record.id;
    }
    offset = data.offset;
  } while (offset);

  return NextResponse.json({ map });
}

// POST — create new records (plain create, no upsert)
export async function POST(req: Request) {
  if (!AIRTABLE_API_KEY) return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { posts?: ContentItem[] };
  const posts = body.posts ?? [];
  if (!posts.length) return NextResponse.json({ synced: 0 });

  const chunks: ContentItem[][] = [];
  for (let i = 0; i < posts.length; i += 10) chunks.push(posts.slice(i, i + 10));

  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchWithTimeout(AIRTABLE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: chunk.map((p) => ({ fields: toAirtableFields(p) })) }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(JSON.stringify(err));
        }
        return res.json() as Promise<{ records: { id: string }[] }>;
      })
    )
  ).catch((err: Error) => NextResponse.json({ error: err.message }, { status: 500 }));

  if (!Array.isArray(results)) return results;
  const created = results.flatMap((r) => r.records);
  const airtableIdMap: Record<string, string> = {};
  posts.forEach((p, i) => { if (created[i]) airtableIdMap[p.id] = created[i].id; });
  return NextResponse.json({ synced: created.length, airtableIdMap });
}

// PATCH — update status of an existing record by Airtable record ID
export async function PATCH(req: Request) {
  if (!AIRTABLE_API_KEY) return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { airtableId?: string; status?: string };
  if (!body.airtableId || !body.status) return NextResponse.json({ updated: 0 });

  const res = await fetchWithTimeout(`${AIRTABLE_URL}/${body.airtableId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { "Status": STATUS_MAP[body.status] ?? body.status } }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 });
  }
  return NextResponse.json({ updated: 1 });
}

// DELETE — remove a record by Airtable record ID
export async function DELETE(req: Request) {
  if (!AIRTABLE_API_KEY) return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { airtableId?: string };
  if (!body.airtableId) return NextResponse.json({ deleted: 0 });

  const res = await fetchWithTimeout(`${AIRTABLE_URL}/${body.airtableId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 });
  }
  return NextResponse.json({ deleted: 1 });
}
