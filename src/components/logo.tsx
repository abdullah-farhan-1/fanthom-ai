// Signal bars + wordmark. The bars echo the conversation waveform used across the app.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-6 items-end gap-[3px]" aria-hidden>
        {[10, 18, 24, 14, 20].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-brand" style={{ height: h, opacity: 0.55 + i * 0.09 }} />
        ))}
      </span>
      {!compact && <span className="font-display text-[0.95rem] font-semibold tracking-[0.08em] max-sm:hidden">FANTHOM</span>}
    </span>
  );
}
