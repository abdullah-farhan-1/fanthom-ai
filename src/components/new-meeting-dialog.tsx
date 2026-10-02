"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileAudio, Plus, Upload, X } from "lucide-react";
import { BrandSpinner, UploadMeter } from "@/components/signal-loader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Supabase free-plan per-file limit

// Local calendar date (en-CA formats as YYYY-MM-DD). toISOString() would give the UTC date,
// which is still "yesterday" in Lahore until 5 am.
const today = () => new Date().toLocaleDateString("en-CA");

class Cancelled extends Error {}

// PUT straight to the signed Supabase URL so large recordings never touch our server, with progress.
// Aborting the signal stops the transfer; an aborted upload leaves no file in storage.
function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(new Cancelled());
    });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

async function postJson(path: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }).catch((err) => {
    throw signal?.aborted ? new Cancelled() : err;
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function NewMeetingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>("upload");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  // Cancellable until the meeting is created; after that, processing has already started on the server.
  const cancellable = busy === "Preparing upload" || busy === "Uploading";

  function cancel() {
    controller.current?.abort();
  }

  function reset() {
    setTitle("");
    setDate(today());
    setFile(null);
    setTranscript("");
    setBusy(null);
    setPct(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      let body: Record<string, unknown>;
      const name = title.trim() || (file ? file.name.replace(/\.[^.]+$/, "") : "");
      if (tab === "upload") {
        if (!file) throw new Error("Choose a recording first.");
        if (date > today()) throw new Error("The meeting date can't be in the future.");
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(`This file is ${(file.size / 1e6).toFixed(0)} MB. The demo storage accepts up to 50 MB; compress it (e.g. to MP3) or paste the transcript instead.`);
        }
        controller.current = new AbortController();
        const { signal } = controller.current;
        setBusy("Preparing upload");
        const { path, url } = await postJson("/api/uploads", { filename: file.name, size: file.size }, signal);
        if (signal.aborted) throw new Cancelled();
        setBusy("Uploading");
        setPct(0);
        await uploadWithProgress(url, file, setPct, signal);
        setPct(null);
        body = { source: file.type.startsWith("video") ? "video" : "audio", media_path: path, title: name, meeting_date: date };
      } else {
        if (date > today()) throw new Error("The meeting date can't be in the future.");
        body = { source: "transcript", transcript, title: name, meeting_date: date };
      }
      setBusy("Starting transcription");
      const { id } = await postJson("/api/meetings", body);
      setOpen(false);
      reset();
      router.push(`/meetings/${id}`);
    } catch (err) {
      if (err instanceof Cancelled) toast("Upload cancelled", { description: file?.name });
      else toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
      setPct(null);
    } finally {
      controller.current = null;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Closing (X / Esc / outside click) during an upload cancels it; once processing has started it can't close mid-request.
        if (!o && busy && !cancellable) return;
        if (!o && cancellable) cancel();
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button className="bg-brand text-brand-foreground hover:bg-brand/90" />}>
        <Plus /> <span className="hidden sm:inline">New meeting</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a meeting</DialogTitle>
          <DialogDescription>
            Upload a recording or paste a transcript. Fanthom turns it into a transcript, notes, action items and clips.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="w-full">
              <TabsTrigger value="upload">Upload recording</TabsTrigger>
              <TabsTrigger value="paste">Paste transcript</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="pt-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/50"
              >
                {file ? <FileAudio className="size-6 text-brand" /> : <Upload className="size-6" />}
                {file ? (
                  <span className="text-foreground">
                    {file.name} · {(file.size / 1e6).toFixed(1)} MB
                  </span>
                ) : (
                  <span>Choose audio or video (MP3, M4A, WAV, MP4, WebM), up to 50 MB</span>
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </TabsContent>
            <TabsContent value="paste" className="pt-3">
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={"Sara: Let's start with the beta date.\nDaniyal: I can have the fix in by Friday.\n\nFathom, Zoom and Meet exports work too."}
                className="h-40 font-mono text-xs"
              />
            </TabsContent>
          </Tabs>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">The date is used to work out deadlines like “next Friday”.</p>
          {busy && <UploadMeter pct={pct} label={busy} />}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!!busy || (tab === "upload" ? !file : transcript.trim().length < 10)}>
              {busy ? (
                <>
                  <BrandSpinner /> {busy}
                </>
              ) : (
                "Create notes"
              )}
            </Button>
            {cancellable && (
              <Button type="button" variant="outline" onClick={cancel}>
                <X /> Cancel upload
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
