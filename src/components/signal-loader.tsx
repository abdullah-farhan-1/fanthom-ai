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
