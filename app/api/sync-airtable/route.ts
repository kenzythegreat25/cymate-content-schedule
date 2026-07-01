import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server";
import type { ContentItem } from "../../../lib/types";

export const maxDuration = 60;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY ?? "";
const AIRTABLE_URL     = "https://api.airtable.com/v0/appAv2zeXuX7yGrEe/tbld3Iw1TPiIKRlv9";
const VALID_PLATFORMS  = new Set(["LinkedIn", "Instagram", "Youtube"]);

function fetchWithTimeout(url: string, options: RequestInit, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function toAirtableRecord(p: ContentItem) {
  const fields: Record<string, unknown> = {
    "Title":  p.title ?? "",
    "Status": "Posted",
  };
  if (p.date)              fields["Date"]              = p.date;
  if (p.onScreenText)      fields["On Screen Text"]    = p.onScreenText;
  if (p.description)       fields["Description"]       = p.description;
  const platforms = p.platforms.filter((pl) => VALID_PLATFORMS.has(pl));
  if (platforms.length)    fields["Platform"]          = platforms;
  const attachments = p.attachments.map((url) => ({ url }));
  if (attachments.length)  fields["Attachments"]       = attachments;
  if (p.contentType)       fields["Content Type"]      = p.contentType;
  if (p.performanceScore)  fields["Performance Score"] = p.performanceScore;
  if (p.notes)             fields["Notes"]             = p.notes;
  return { fields };
}

export async function POST(req: Request) {
  if (!AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  }

  // Verify auth
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { posts?: ContentItem[] };
  const posts = body.posts ?? [];
  if (!posts.length) return NextResponse.json({ synced: 0 });

  // Batch into groups of 10, send all batches in parallel
  const chunks: ContentItem[][] = [];
  for (let i = 0; i < posts.length; i += 10) chunks.push(posts.slice(i, i + 10));

  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchWithTimeout(AIRTABLE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: chunk.map(toAirtableRecord) }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(JSON.stringify(err));
        }
        return res.json() as Promise<{ records: unknown[] }>;
      })
    )
  ).catch((err: Error) =>
    NextResponse.json({ error: err.message }, { status: 500 })
  );

  if (!Array.isArray(results)) return results;
  const airtableRecords = results.flatMap((r) => r.records as { id: string }[]);
  const airtableIdMap: Record<string, string> = {};
  posts.forEach((p, i) => { if (airtableRecords[i]) airtableIdMap[p.id] = airtableRecords[i].id; });
  return NextResponse.json({ synced: airtableRecords.length, newlySyncedIds: posts.map((p) => p.id), airtableIdMap });
}

export async function DELETE(req: Request) {
  if (!AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "AIRTABLE_API_KEY not set." }, { status: 500 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

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
