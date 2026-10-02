import { cn } from "@/lib/utils";

// The Fanthom mark: an equaliser inside code braces. Raw conversation in, structured data out.
const BARS = [
  { x: 12.2, h: 7 },
  { x: 15.9, h: 13 },
  { x: 19.6, h: 18 },
  { x: 23.3, h: 10 },
  { x: 27, h: 14 },
];

export function Mark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 40 26" className={cn("h-6 w-auto", className)} aria-hidden fill="none">
      <path
        d="M8 2.5c-2.6 0-3.4 1.2-3.4 3.6v3.6c0 1.6-.8 2.7-2.6 3.3 1.8.6 2.6 1.7 2.6 3.3v3.6c0 2.4.8 3.6 3.4 3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M32 2.5c2.6 0 3.4 1.2 3.4 3.6v3.6c0 1.6.8 2.7 2.6 3.3-1.8.6-2.6 1.7-2.6 3.3v3.6c0 2.4-.8 3.6-3.4 3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {BARS.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={13 - b.h / 2}
          width="2.4"
          height={b.h}
          rx="1.2"
          className={cn("fill-brand", animated && "listen-bar")}
          style={animated ? { animationDelay: `${i * 0.12}s` } : undefined}
        />
      ))}
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="group flex items-center gap-2.5">
      <Mark className="text-foreground transition-colors group-hover:text-brand" />
      {!compact && <span className="font-display text-[0.95rem] font-semibold tracking-[0.08em] max-sm:hidden">FANTHOM</span>}
    </span>
  );
}

// Section labels framed by the brand braces: { transcript · 439 }
export function BraceLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("label-mono", className)}>
      <span className="text-brand/70">{"{ "}</span>
      {children}
      <span className="text-brand/70">{" }"}</span>
    </p>
  );
}
