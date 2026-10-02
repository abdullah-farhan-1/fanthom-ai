import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMeeting } from "@/lib/queries";
import { MeetingView } from "@/components/meeting/meeting-view";
import { ProcessingState } from "@/components/meeting/processing-state";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/meetings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const detail = await getMeeting(id);
  return { title: detail?.meeting.title ?? "Meeting" };
}

export default async function MeetingPage({ params, searchParams }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  const detail = await getMeeting(id);
  if (!detail) notFound();

  if (detail.meeting.status !== "ready") {
    return <ProcessingState meeting={detail.meeting} />;
  }
  const startAt = Number(Array.isArray(t) ? t[0] : t);
  return <MeetingView {...detail} startAt={Number.isFinite(startAt) ? startAt : null} />;
}
