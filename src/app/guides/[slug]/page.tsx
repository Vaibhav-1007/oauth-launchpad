import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/guide-view";
import { getGuide } from "@/lib/store";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "Guide not found" };
  const g = await getGuide(slug).catch(() => null);
  return { title: g ? `${g.appName} OAuth setup guide · OAuth Launchpad` : "Guide · OAuth Launchpad" };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 80) notFound();
  const guide = await getGuide(slug); // storage errors propagate to error.tsx (retry UI)
  if (!guide) notFound();
  return <GuideView guide={guide} />;
}
