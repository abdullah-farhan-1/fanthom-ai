import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Unbounded } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });
const display = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Fanthom", template: "%s · Fanthom" },
  description: "AI meeting notes you can check: transcript, summary templates, action items, highlights and clips.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${body.variable} ${code.variable} ${display.variable} h-full antialiased`}>
      <body className="signal-bg min-h-full flex flex-col">
        <TooltipProvider>
          <AppHeader />
          <main className="flex-1">{children}</main>
        </TooltipProvider>
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
