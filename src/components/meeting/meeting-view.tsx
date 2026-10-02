"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, FileText } from "lucide-react";
import type { MeetingDetail } from "@/lib/queries";
import { formatDate, formatDuration, formatTime, speakerLabel } from "@/lib/format";
import { TranscriptPanel } from "./transcript-panel";
import { NotesPanel } from "./notes-panel";
import { SpeakersRow } from "./speakers-row";
import { Chapters } from "./chapters";

export interface SpeakerInfo {
  label: string;
  name: string;
  order: number;
  seconds: number;
}

// Index of the segment playing at time t (last segment that started at or before t).
export function segmentAt(starts: number[], t: number) {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t + 0.05) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function MeetingView({ meeting, segments, mediaUrl, highlights, startAt }: MeetingDetail & { startAt: number | null }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [time, setTime] = useState(startAt ?? 0);
  const [speakers, setSpeakers] = useState<Record<string, string>>(meeting.speakers ?? {});
  const [jumpSignal, setJumpSignal] = useState(0); // bumps when the user seeks, so the transcript scrolls

  const starts = useMemo(() => segments.map((s) => s.start_s), [segments]);
  const activeIdx = segmentAt(starts, time);

  const speakerInfo = useMemo(() => {
    const map = new Map<string, SpeakerInfo>();
    for (const s of segments) {
      const info = map.get(s.speaker) ?? { label: s.speaker, name: "", order: map.size, seconds: 0 };
      info.seconds += Math.max(0, s.end_s - s.start_s);
      map.set(s.speaker, info);
    }
    for (const info of map.values()) info.name = speakerLabel(info.label, speakers);
    return map;
  }, [segments, speakers]);

  const seek = useCallback(
    (t: number, play = true) => {
      setTime(t);
      setJumpSignal((n) => n + 1);
      const media = mediaRef.current;
      if (media) {
        media.currentTime = t;
        if (play) media.play().catch(() => {});
      }
    },
    [],
  );

  // Deep links (?t=123) start at that moment once the media is ready.
  useEffect(() => {
    if (startAt === null) return;
    const media = mediaRef.current;
    if (!media) return setJumpSignal((n) => n + 1);
    const go = () => {
      media.currentTime = startAt;
      setJumpSignal((n) => n + 1);
    };
    if (media.readyState >= 1) go();
    else media.addEventListener("loadedmetadata", go, { once: true });
  }, [startAt]);

  const duration = meeting.duration_s ?? segments.at(-1)?.end_s ?? 0;
  const isVideo = meeting.source === "video";

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> {formatDate(meeting.meeting_date)}
            </span>
            {duration > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {formatDuration(duration)}
              </span>
            )}
            <span>
              {speakerInfo.size} {speakerInfo.size === 1 ? "speaker" : "speakers"} · {segments.length} lines
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-background">
          {mediaUrl ? (
            isVideo ? (
              <video
                ref={(el) => {
                  mediaRef.current = el;
                }}
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black"
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              />
            ) : (
              <div className="p-4">
                <audio
                  ref={(el) => {
                    mediaRef.current = el;
                  }}
                  src={mediaUrl}
                  controls
                  preload="metadata"
                  className="w-full"
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                />
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <FileText className="size-5 text-brand" />
              Transcript-only meeting · clicking a line selects that moment ({formatTime(time)})
            </div>
          )}
          <Chapters chapters={meeting.notes?.chapters ?? []} segments={segments} duration={duration} time={time} onSeek={seek} />
          <SpeakersRow meetingId={meeting.id} info={speakerInfo} duration={duration} onRenamed={setSpeakers} />
        </div>

        <NotesPanel
          meeting={meeting}
          segments={segments}
          speakers={speakers}
          highlights={highlights}
          time={time}
          activeIdx={activeIdx}
          onSeek={seek}
        />
      </div>

      <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
        <TranscriptPanel
          segments={segments}
          speakerInfo={speakerInfo}
          activeIdx={activeIdx}
          jumpSignal={jumpSignal}
          onSeek={seek}
        />
      </aside>
    </div>
  );
}
