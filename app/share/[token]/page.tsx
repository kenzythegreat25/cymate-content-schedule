import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import SharePageClient from "./SharePageClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL ?? "https://content-schedule-studio.vercel.app";

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url);
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;

  // Always fall back to the generated OG card for this token
  const generatedOg = `${SITE_URL}/api/og?token=${token}`;

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await supabase
      .from("posts")
      .select("title, description, attachment_urls, attachments")
      .eq("share_token", token)
      .single();

    if (!data) return defaultMeta(generatedOg);

    const title = data.title ? `${data.title} · Cymate Review` : "Cymate Content Review";
    const description = data.description
      ? data.description.replace(/#\S+/g, "").trim().slice(0, 200)
      : "Review and approve this post from Cymate Content Studio.";

    // Prefer first image from attachment_urls, fall back to legacy attachments column
    const urls: string[] = [
      ...(Array.isArray(data.attachment_urls) ? data.attachment_urls : []),
      ...(data.attachments && typeof data.attachments === "string" && data.attachments.trim()
        ? [data.attachments.trim()]
        : []),
    ];
    const coverImage = urls.find(isImageUrl) ?? generatedOg;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        images: [{ url: coverImage, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [coverImage],
      },
    };
  } catch {
    return defaultMeta(generatedOg);
  }
}

function defaultMeta(ogImage: string): Metadata {
  return {
    title: "Cymate Content Review",
    description: "Review and approve this post from Cymate Content Studio.",
    openGraph: {
      title: "Cymate Content Review",
      description: "Review and approve this post from Cymate Content Studio.",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
    },
  };
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return <SharePageClient params={params} />;
}
