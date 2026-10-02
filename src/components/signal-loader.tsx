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

// Inline brand spinner, sized by the surrounding font: { ılıl } with talking bars. Replaces circular spinners.
export function BrandSpinner({ className, bars = 4 }: { className?: string; bars?: number }) {
  return (
    <span className={cn("inline-flex h-[1em] shrink-0 items-center gap-[0.12em] font-mono leading-none", className)} role="status" aria-label="Loading">
      <span className="opacity-70">{"{"}</span>
      <span className="inline-flex h-[0.8em] items-center gap-[0.1em]">
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className="listen-bar inline-block h-full w-[0.14em] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
      <span className="opacity-70">{"}"}</span>
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
