"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LikeButton({
  meetingId,
  initial,
  onChange,
  className,
}: {
  meetingId: string;
  initial: boolean;
  onChange?: (liked: boolean) => void;
  className?: string;
}) {
  const [liked, setLiked] = useState(initial);

  async function toggle(e: React.MouseEvent) {
    // Rows are links; liking must not open the meeting.
    e.preventDefault();
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    onChange?.(next);
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked: next }),
    });
    if (!res.ok) {
      setLiked(!next);
      onChange?.(!next);
      toast.error("Could not save like", { description: "If this keeps happening, the liked column migration may not have been run." });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike meeting" : "Like meeting"}
      title={liked ? "Liked" : "Like"}
      className={cn(
        "grid size-8 place-items-center rounded-full border transition",
        liked ? "border-brand/40 bg-brand-soft text-brand" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn("size-4 transition-transform", liked && "scale-110 fill-current")} />
    </button>
  );
}
