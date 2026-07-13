import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import SharePageClient from "./SharePageClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url);
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await supabase
      .from("posts")
      .select("title, description, attachment_urls")
      .eq("share_token", token)
      .single();

    if (!data) return defaultMeta();

    const title = data.title ? `${data.title} · Cymate Review` : "Cymate Content Review";
    const description = data.description
      ? data.description.replace(/#\S+/g, "").trim().slice(0, 200)
      : "Review and approve this post from Cymate Content Studio.";

    const attachments: string[] = data.attachment_urls ?? [];
    const coverImage = attachments.find(isImageUrl);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        ...(coverImage ? { images: [{ url: coverImage, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: coverImage ? "summary_large_image" : "summary",
        title,
        description,
        ...(coverImage ? { images: [coverImage] } : {}),
      },
    };
  } catch {
    return defaultMeta();
  }
}

function defaultMeta(): Metadata {
  return {
    title: "Cymate Content Review",
    description: "Review and approve this post from Cymate Content Studio.",
  };
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return <SharePageClient params={params} />;
}
