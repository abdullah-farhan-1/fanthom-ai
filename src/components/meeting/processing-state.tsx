"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/lib/types";

export function ProcessingState({ meeting }: { meeting: Meeting }) {
  const router = useRouter();
  const [status, setStatus] = useState({ status: meeting.status, stage: meeting.stage, error: meeting.error });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status.status !== "processing") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/meetings/${meeting.id}`).catch(() => null);
      if (!res?.ok) return;
      const next = await res.json();
      setStatus({ status: next.status, stage: next.stage, error: next.error });
      if (next.status === "ready") router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [status.status, meeting.id, router]);

  async function retry() {
    setRetrying(true);
    const res = await fetch(`/api/meetings/${meeting.id}/retry`, { method: "POST" });
    setRetrying(false);
    if (!res.ok) return toast.error("Could not restart processing");
    setStatus({ status: "processing", stage: meeting.source === "transcript" ? "Writing notes" : "Transcribing", error: null });
  }

  const steps = meeting.source === "transcript" ? ["Transcript received", "Writing notes"] : ["Uploaded", "Transcribing", "Writing notes"];
  const current = Math.max(1, steps.indexOf(status.stage ?? ""));

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border bg-background p-8">
        <h1 className="text-lg font-semibold">{meeting.title}</h1>
        {status.status === "failed" ? (
          <div className="mt-6 space-y-4">
            <div className="flex gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Processing failed</p>
                <p className="mt-1 break-words opacity-90">{status.error}</p>
              </div>
            </div>
            <Button onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />} Try again
            </Button>
          </div>
        ) : (
          <ol className="mt-6 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                {i < current ? (
                  <Check className="size-4 text-emerald-600" />
                ) : i === current ? (
                  <Loader2 className="size-4 animate-spin text-brand" />
                ) : (
                  <span className="size-4 rounded-full border" />
                )}
                <span className={i > current ? "text-muted-foreground" : ""}>{step}</span>
              </li>
            ))}
            <li className="pt-2 text-xs text-muted-foreground">
              Usually under a minute. An hour-long recording can take two or three. You can leave this page.
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
