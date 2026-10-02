"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandSpinner } from "@/components/signal-loader";

export function DeleteMeetingButton({
  meetingId,
  title,
  onDeleted,
  className,
}: {
  meetingId: string;
  title: string;
  onDeleted: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return toast.error("Could not delete meeting", { description: json.error });
    }
    setOpen(false);
    toast.success("Meeting deleted", { description: title });
    onDeleted();
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Rows are links; deleting must not open the meeting.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Delete meeting"
        title="Delete meeting"
        className={cn(
          "grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-destructive/50 hover:text-destructive",
          className,
        )}
      >
        <Trash2 className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              “{title}” will be removed with its recording, transcript, notes and clips. Shared clip links will stop working.
              This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <BrandSpinner /> : <Trash2 />} {busy ? "Deleting" : "Delete meeting"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
