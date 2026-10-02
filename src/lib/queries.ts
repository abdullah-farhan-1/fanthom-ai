import { cache } from "react";
import { db, BUCKET } from "./supabase";
import { loadSegments } from "./pipeline";
import type { Meeting, Segment } from "./types";
import { withNames } from "./format";

export interface MeetingListItem {
  id: string;
  title: string;
  meeting_date: string;
  source: Meeting["source"];
  duration_s: number | null;
  status: Meeting["status"];
  stage: string | null;
  overview: string | null;
  action_items: number;
  needs_review: number;
  speakers: string[];
  liked: boolean;
  created_at: string;
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  const { data, error } = await db()
    .from("meetings")
    .select("*") // "*" so the list still works before the liked column migration has been run
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    meeting_date: m.meeting_date,
    source: m.source,
    duration_s: m.duration_s === null ? null : Number(m.duration_s),
    status: m.status,
    stage: m.stage,
    overview: m.notes?.overview ? withNames(m.notes.overview, m.speakers ?? {}) : null,
    action_items: m.notes?.action_items?.length ?? 0,
    needs_review: (m.notes?.action_items ?? []).filter((a: { status: string }) => a.status === "needs_review").length,
    speakers: Object.values(m.speakers ?? {}) as string[],
    liked: Boolean(m.liked),
    created_at: m.created_at,
  }));
}

export interface Highlight {
  id: string;
  start_s: number;
  end_s: number;
  title: string | null;
  share_id: string;
  created_at: string;
}

export interface MeetingDetail {
  meeting: Meeting;
  segments: Segment[];
  mediaUrl: string | null;
  highlights: Highlight[];
}

// cache(): generateMetadata and the page share one fetch per request instead of querying twice.
export const getMeeting = cache(async (id: string): Promise<MeetingDetail | null> => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: meeting } = await db().from("meetings").select("*").eq("id", id).maybeSingle();
  if (!meeting) return null;
  const [segments, media, highlights] = await Promise.all([
    loadSegments(id),
    meeting.media_path ? db().storage.from(BUCKET).createSignedUrl(meeting.media_path, 60 * 60 * 6) : null,
    db().from("highlights").select("id, start_s, end_s, title, share_id, created_at").eq("meeting_id", id).order("start_s"),
  ]);
  return {
    meeting: { ...meeting, duration_s: meeting.duration_s === null ? null : Number(meeting.duration_s) } as Meeting,
    segments,
    mediaUrl: media?.data?.signedUrl ?? null,
    highlights: (highlights.data ?? []).map((h) => ({ ...h, start_s: Number(h.start_s), end_s: Number(h.end_s) })),
  };
});
