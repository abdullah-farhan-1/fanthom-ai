"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";

// Click-to-rename meeting title, like speaker names: Enter or clicking away saves, Esc cancels.
export function EditableTitle({ meetingId, initial }: { meetingId: string; initial: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);

  async function save() {
    setEditing(false);
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || next === title) return setDraft(title);
    const previous = title;
    setTitle(next); // optimistic
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      setTitle(previous);
      setDraft(previous);
      const json = await res.json().catch(() => ({}));
      return toast.error("Couldn't rename the meeting", { description: json.error });
    }
    const saved = (await res.json()).title ?? next;
    setTitle(saved);
    setDraft(saved);
    toast.success("Meeting renamed", { description: saved });
    router.refresh(); // list, search and tab title pick up the new name
  }

  const cls = "font-display text-2xl font-medium leading-tight tracking-tight sm:text-3xl";

  if (editing) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          aria-label="Meeting title"
          className={`${cls} w-full min-w-0 rounded-lg border border-brand/40 bg-panel-2/70 px-2 py-0.5 outline-none focus:border-brand/70`}
        />
        <button type="submit" onMouseDown={(e) => e.preventDefault()} aria-label="Save title" className="shrink-0 text-brand">
          <Check className="size-5" />
        </button>
      </form>
    );
  }

  return (
    <h1 className={`${cls} min-w-0`}>
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        title="Rename meeting"
        className="group inline text-left"
      >
        {title}
        <Pencil className="ml-2 inline size-4 align-middle text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    </h1>
  );
}
