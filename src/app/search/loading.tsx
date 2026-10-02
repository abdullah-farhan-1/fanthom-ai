import { SignalLoader } from "@/components/signal-loader";

export default function LoadingSearch() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="panel p-8">
        <SignalLoader label="Searching every transcript" className="py-8" />
      </div>
    </div>
  );
}
