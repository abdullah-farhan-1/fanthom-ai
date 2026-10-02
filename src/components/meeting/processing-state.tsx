"use client";

import { useRouter } from "next/navigation";
import { BraceLabel } from "@/components/logo";
import { BrandSpinner, SignalLoader } from "@/components/signal-loader";
import { useEffect, useState } from "react";
import { Check, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Meeting } from "@/lib/types";

export function ProcessingState({ meeting }: { meeting: Meeting }) {
  const router = useRouter();
  const [status, setStatus] = useState({ status: meeting.status, stage: meeting.stage, error: meeting.error });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status.status !== "processing") return;
    const check = async () => {
      const res = await fetch(`/api/meetings/${meeting.id}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const next = await res.json();
      setStatus({ status: next.status, stage: next.stage, error: next.error });
      if (next.status === "ready") router.refresh();
    };
    const timer = setInterval(check, 2000);
    // Background tabs throttle timers; check right away when the user comes back.
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status.status, meeting.id, router]);

  // Once ready, the soft refresh should replace this screen with the meeting (unmounting it and
  // cancelling this timer). If it hasn't after 4 s, reload the page as a fallback.
  useEffect(() => {
    if (status.status !== "ready") return;
    const t = setTimeout(() => window.location.reload(), 4000);
    return () => clearTimeout(t);
  }, [status.status]);

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
      <div className="panel p-8">
        {status.status !== "failed" && <SignalLoader className="mb-6" />}
        <BraceLabel>processing</BraceLabel>
        <h1 className="mt-2 font-display text-xl font-medium">{meeting.title}</h1>
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
              {retrying ? <BrandSpinner /> : <RotateCcw />} Try again
            </Button>
          </div>
        ) : (
          <ol className="mt-6 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                {i < current ? (
                  <Check className="size-4 text-brand" />
                ) : i === current ? (
                  <BrandSpinner className="text-sm text-brand" />
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
