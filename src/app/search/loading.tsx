import { SignalLoader } from "@/components/signal-loader";

// Centered like the processing screen, so the loader sits inside the background brand mark.
export default function LoadingSearch() {
  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] place-items-center px-4 pb-[14vh]">
      <SignalLoader label="Searching every transcript" />
    </div>
  );
}
