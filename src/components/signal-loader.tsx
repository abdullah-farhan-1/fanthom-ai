import { cn } from "@/lib/utils";

// Brand loader: equaliser bars "talking" inside still code braces, with a status line.
export function SignalLoader({ label, className }: { label?: string; className?: string }) {
  const bars = [0.45, 0.75, 1, 0.6, 0.85, 0.5, 0.95, 0.7, 0.4];
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)} role="status" aria-live="polite">
      <div className="flex h-16 items-center gap-3" aria-hidden>
        <span className="font-mono text-5xl font-light leading-none text-foreground/80">{"{"}</span>
        <div className="flex h-12 items-center gap-[5px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className="listen-bar w-[5px] rounded-full bg-brand shadow-[0_0_12px_-2px_var(--brand)]"
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.09}s` }}
            />
          ))}
        </div>
        <span className="font-mono text-5xl font-light leading-none text-foreground/80">{"}"}</span>
      </div>
      {label && <p className="label-mono">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

// Inline brand spinner { ı|ı } with talking bars. Fixed pixel sizes so it stays legible inside
// tiny mono labels as well as buttons (em-based sizing crammed it at small font sizes).
const SPINNER_SIZES = {
  // sm: braces drawn as SVG so they align with the bars at label sizes (font glyphs sit low)
  sm: { h: 12, bar: 2, gap: 2, bars: [0.6, 1, 0.75], anim: "listen-bar-sm" },
  md: { h: 15, bar: 2.5, gap: 2.5, bars: [0.6, 1, 0.75], anim: "listen-bar-sm" },
} as const;

function Brace({ h, flip }: { h: number; flip?: boolean }) {
  return (
    <svg viewBox="0 0 6 16" style={{ height: h, width: (h * 6) / 16 }} className={cn("shrink-0 opacity-70", flip && "-scale-x-100")} fill="none" aria-hidden>
      <path d="M5 1C3 1 2.4 1.8 2.4 3.4v2.8c0 1-.5 1.6-1.6 1.8 1.1.2 1.6.8 1.6 1.8v2.8C2.4 14.2 3 15 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandSpinner({ className, size = "md" }: { className?: string; size?: keyof typeof SPINNER_SIZES }) {
  const z = SPINNER_SIZES[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-[3px] align-middle", className)} role="status" aria-label="Loading">
      <Brace h={z.h} />
      <span className="inline-flex items-center" style={{ height: z.h * 0.75, gap: z.gap }}>
        {z.bars.map((h, i) => (
          <span
            key={i}
            className={cn("inline-block rounded-full bg-current", z.anim)}
            style={{ width: z.bar, height: `${h * 100}%`, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      <Brace h={z.h} flip />
    </span>
  );
}

// Upload progress as an equaliser filling up between braces; lit bars keep "talking".
export function UploadMeter({ pct, label }: { pct: number | null; label: string }) {
  const total = 28;
  const lit = pct === null ? total : Math.round((pct / 100) * total);
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xl font-light text-foreground/70">{"{"}</span>
        <div className="flex h-8 flex-1 items-center gap-[3px]">
          {Array.from({ length: total }, (_, i) => {
            const on = i < lit;
            return (
              <span
                key={i}
                className={cn("flex-1 rounded-full transition-colors duration-300", on ? "listen-bar bg-brand" : "bg-muted")}
                style={{ height: `${35 + Math.abs(Math.sin(i * 1.7)) * 65}%`, animationDelay: `${(i % 7) * 0.1}s` }}
              />
            );
          })}
        </div>
        <span className="font-mono text-2xl font-light text-foreground/70">{"}"}</span>
      </div>
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {pct !== null && <span className="text-brand">{pct}%</span>}
      </div>
    </div>
  );
}
