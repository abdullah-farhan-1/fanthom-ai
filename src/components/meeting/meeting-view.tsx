"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeetingDetail } from "@/lib/queries";
import { formatDate, formatDuration, speakerLabel } from "@/lib/format";
import { TranscriptPanel } from "./transcript-panel";
import { NotesPanel } from "./notes-panel";
import { SpeakersRow } from "./speakers-row";
import { Chapters } from "./chapters";
import { Timeline } from "./timeline";
import { LikeButton } from "@/components/like-button";
import { DeleteMeetingButton } from "@/components/delete-meeting-button";
import { useRouter } from "next/navigation";

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

const RATES = [1, 1.25, 1.5, 2];

export function MeetingView({ meeting, segments, mediaUrl, highlights, startAt }: MeetingDetail & { startAt: number | null }) {
  const router = useRouter();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [time, setTime] = useState(startAt ?? 0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [speakers, setSpeakers] = useState<Record<string, string>>(meeting.speakers ?? {});
  const [clips, setClips] = useState(highlights);
  const [jumpSignal, setJumpSignal] = useState(0); // bumps when the user seeks, so the transcript scrolls

  const starts = useMemo(() => segments.map((s) => s.start_s), [segments]);
  const activeIdx = segmentAt(starts, time);
  const duration = meeting.duration_s ?? segments.at(-1)?.end_s ?? 0;

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

  const seek = useCallback((t: number, play = true) => {
    setTime(t);
    setJumpSignal((n) => n + 1);
    const media = mediaRef.current;
    if (media) {
      media.currentTime = t;
      if (play) media.play().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  }, []);

  // Deep links (?t=123) start at that moment once the media is ready.
  useEffect(() => {
    if (startAt === null) return;
    const media = mediaRef.current;
    if (!media) return;
    const go = () => {
      media.currentTime = startAt;
    };
    if (media.readyState >= 1) go();
    else media.addEventListener("loadedmetadata", go, { once: true });
  }, [startAt]);

  // Space toggles playback anywhere on the page except in text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== " " || el.closest("input, textarea, button, [role=slider]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const mediaProps = {
    ref: (el: HTMLMediaElement | null) => {
      mediaRef.current = el;
    },
    src: mediaUrl ?? undefined,
    preload: "metadata" as const,
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime(e.currentTarget.currentTime),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
  };

  const chapterMarkers = (meeting.notes?.chapters ?? []).map((c) => ({ t: segments[c.idx]?.start_s ?? 0, label: c.title }));
  const actionMarkers = (meeting.notes?.action_items ?? [])
    .filter((a) => a.review !== "removed" && segments[a.idx])
    .map((a) => ({ t: segments[a.idx].start_s, label: a.task }));

  return (
    <div className="rise mx-auto grid max-w-[1400px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <header className="lg:col-span-2">
        <p className="label-mono">
          <span className="text-brand/70">{"{ "}</span>meeting<span className="text-brand/70">{" }"}</span> · {formatDate(meeting.meeting_date)}
          {duration > 0 && ` · ${formatDuration(duration)}`} · {speakerInfo.size} {speakerInfo.size === 1 ? "speaker" : "speakers"} · {meeting.source}
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-medium leading-tight tracking-tight sm:text-3xl">{meeting.title}</h1>
          <div className="mt-1 flex shrink-0 gap-2">
            <LikeButton meetingId={meeting.id} initial={Boolean(meeting.liked)} className="size-9" />
            <DeleteMeetingButton
              meetingId={meeting.id}
              title={meeting.title}
              className="size-9"
              onDeleted={() => {
                router.push("/");
                router.refresh();
              }}
            />
          </div>
        </div>
      </header>

      <div className="min-w-0 space-y-5">
        <section className="panel overflow-hidden">
          {mediaUrl && meeting.source === "video" && (
            <video {...mediaProps} src={`${mediaUrl}#t=0.1`} playsInline onClick={toggle} className="aspect-video w-full cursor-pointer bg-black" />
          )}
          {mediaUrl && meeting.source !== "video" && <audio {...mediaProps} className="hidden" />}
          <Timeline
            segments={segments}
            speakerInfo={speakerInfo}
            duration={duration}
            time={time}
            playing={playing}
            rate={rate}
            hasMedia={!!mediaUrl}
            chapters={chapterMarkers}
            highlights={clips.map((h) => ({ t: h.start_s, label: h.title ?? "Highlight" }))}
            actions={actionMarkers}
            onSeek={seek}
            onToggle={toggle}
            onRate={() => {
              const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
              setRate(next);
              if (mediaRef.current) mediaRef.current.playbackRate = next;
            }}
          />
          <Chapters chapters={meeting.notes?.chapters ?? []} segments={segments} duration={duration} time={time} onSeek={seek} />
          <SpeakersRow meetingId={meeting.id} info={speakerInfo} duration={duration} onRenamed={setSpeakers} />
        </section>

        <NotesPanel
          meeting={meeting}
          segments={segments}
          speakers={speakers}
          highlights={clips}
          onHighlightsChange={setClips}
          time={time}
          activeIdx={activeIdx}
          onSeek={seek}
        />
      </div>

      <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
        <TranscriptPanel segments={segments} speakerInfo={speakerInfo} activeIdx={activeIdx} jumpSignal={jumpSignal} onSeek={seek} />
      </aside>
    </div>
  );
}
