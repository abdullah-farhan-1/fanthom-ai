import Link from "next/link";
import { BraceLabel } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-mono text-6xl font-light text-foreground/80">
        {"{ "}
        <span className="text-brand">404</span>
        {" }"}
      </p>
      <BraceLabel className="mt-6">nothing on the record</BraceLabel>
      <p className="mt-3 text-muted-foreground">This meeting or clip doesn’t exist, or its link has changed.</p>
      <Link href="/" className="mt-8 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
        Back to meetings
      </Link>
    </div>
  );
}
