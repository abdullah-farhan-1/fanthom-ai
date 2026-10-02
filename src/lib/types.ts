export interface Segment {
  idx: number;
  speaker: string; // Deepgram label ("0", "1") or a name from a pasted transcript
  start_s: number;
  end_s: number;
  text: string;
}

export type MeetingSource = "audio" | "video" | "transcript";
export type MeetingStatus = "processing" | "ready" | "failed";

export interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  source: MeetingSource;
  media_path: string | null;
  duration_s: number | null;
  status: MeetingStatus;
  stage: string | null;
  error: string | null;
  speakers: Record<string, string>;
  notes: import("./notes").Notes | null;
  model: string | null;
  created_at: string;
}
