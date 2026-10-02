"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Values are local calendar dates as "YYYY-MM-DD" (no time zone shifts).
const toDate = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toValue = (d: Date) => d.toLocaleDateString("en-CA");
const label = (v: string) =>
  toDate(v).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function DatePicker({ id, value, onChange }: { id?: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const pick = (d: Date) => {
    onChange(toValue(d));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-panel-2/60 px-2.5 text-left font-mono text-xs transition hover:border-brand/40 focus-visible:border-brand/60 focus-visible:outline-none data-[popup-open]:border-brand/60"
      >
        <CalendarDays className="size-4 text-brand" />
        <span className="flex-1 whitespace-nowrap">{label(value)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto border-border bg-popover/95 p-0 backdrop-blur-xl">
        <div className="flex gap-1 border-b border-border p-2">
          {[
            { text: "Today", date: today },
            { text: "Yesterday", date: yesterday },
          ].map((q) => (
            <button
              key={q.text}
              type="button"
              onClick={() => pick(q.date)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition",
                toValue(q.date) === value ? "border-brand bg-brand-soft text-brand" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {q.text}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={toDate(value)}
          defaultMonth={toDate(value)}
          onSelect={(d) => d && pick(d)}
          disabled={{ after: today }}
          endMonth={today}
          // Always 6 rows: a constant height stops the popover re-positioning when switching months.
          fixedWeeks
          className="[--cell-size:2.1rem]"
        />
        <p className="border-t border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Used to resolve deadlines like “next Friday”
        </p>
      </PopoverContent>
    </Popover>
  );
}
