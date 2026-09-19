import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "@/components/Brand";
import { findShareByToken, shareMediaUrl, sharePageUrl } from "@/lib/share";
import { SharePlayer } from "@/components/SharePlayer";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await findShareByToken(token);
  if (!share) return { title: "Not found" };

  const pageUrl = sharePageUrl(share.token);
  const poster = share.posterUrl ? shareMediaUrl(share.token, "poster") : undefined;
  const video = share.videoUrl ? shareMediaUrl(share.token, "video") : undefined;
  const description = share.description || `Made with ${BRAND.name}`;

  return {
    title: share.title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: share.title,
      description,
      url: pageUrl,
      type: video ? "video.other" : "website",
      images: poster ? [{ url: poster, width: 1024, height: 1024, alt: share.title }] : undefined,
      videos: video
        ? [{ url: video, type: "video/mp4", width: 1080, height: 1920 }]
        : undefined,
    },
    twitter: {
      // summary_large_image unfurls the poster; Discord/Slack use openGraph.videos for inline play.
      card: "summary_large_image",
      title: share.title,
      description,
      images: poster ? [poster] : undefined,
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const share = await findShareByToken(token);
  if (!share) notFound();

  const posterSrc = share.posterUrl ? shareMediaUrl(share.token, "poster") : null;
  const videoSrc = share.videoUrl ? shareMediaUrl(share.token, "video") : null;
  const pageUrl = sharePageUrl(share.token);

  return (
    <main className="studio-main share-page">
      <nav className="app-nav" aria-label="Share">
        <Brand />
      </nav>
      <p className="eyebrow">SHARED WITH VERAGEN</p>
      <h1>{share.title}</h1>
      {share.description && <p className="subtitle">{share.description}</p>}
      <SharePlayer
        title={share.title}
        posterSrc={posterSrc}
        videoSrc={videoSrc}
        pageUrl={pageUrl}
        ready={!!videoSrc}
      />
    </main>
  );
}
