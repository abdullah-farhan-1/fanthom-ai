import { cn } from "@/lib/utils";

// Animated waveform used while pages load: the app's signal motif, "listening".
export function SignalLoader({ bars = 48, label, className }: { bars?: number; label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)} role="status" aria-live="polite">
      <div className="flex h-16 w-full max-w-md items-center gap-[3px]" aria-hidden>
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className="listen-bar h-full flex-1 rounded-full bg-brand"
            style={{
              animationDelay: `${(i % 12) * 0.08 + Math.floor(i / 12) * 0.03}s`,
              opacity: 0.35 + 0.65 * Math.abs(Math.sin((i / bars) * Math.PI)),
            }}
          />
        ))}
      </div>
      {label && <p className="label-mono">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
