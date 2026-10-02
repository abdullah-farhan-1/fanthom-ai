import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NewMeetingDialog } from "@/components/new-meeting-dialog";
import { SearchBox } from "@/components/search-box";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Fanthom", template: "%s · Fanthom" },
  description: "AI meeting notes you can check: transcript, summary templates, action items, highlights and clips.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-muted/30">
        <TooltipProvider>
          <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="grid size-7 place-items-center rounded-lg bg-brand text-brand-foreground text-sm">F</span>
                <span className="hidden sm:inline">Fanthom</span>
              </Link>
              <div className="flex-1">
                <SearchBox />
              </div>
              <NewMeetingDialog />
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
