// A huge, faint brand mark { ılılı } fixed behind the content and in front of the grid.
// Purely decorative: no pointer events, hidden from assistive tech.
const BARS = [0.34, 0.58, 0.82, 1, 0.7, 0.9, 0.52, 0.76, 0.44];

export function BackdropMark() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 600 260" className="w-[min(1200px,130vw)] opacity-[0.045]" fill="none">
        <path
          d="M95 20c-30 0-40 14-40 42v42c0 18-9 30-30 26 21 4 30 16 30 34v42c0 28 10 42 40 42"
          stroke="white"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M505 20c30 0 40 14 40 42v42c0 18 9 30 30 26-21 4-30 16-30 34v42c0 28-10 42-40 42"
          stroke="white"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {BARS.map((h, i) => {
          const height = 190 * h;
          return (
            <rect
              key={i}
              x={150 + i * 36}
              y={130 - height / 2}
              width="18"
              height={height}
              rx="9"
              className="backdrop-bar fill-brand" fillOpacity={0.55}
              style={{ animationDelay: `${i * -0.6}s` }}
            />
          );
        })}
      </svg>
    </div>
  );
}
