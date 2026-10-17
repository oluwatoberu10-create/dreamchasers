import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Dream Chasers Community", template: "%s · Dream Chasers Community" },
  description: "Weekly courses, assignments, feedback and reflection — a learning community that helps every learner keep improving.",
};

export const viewport: Viewport = {
  // The app is light-only (globals.css pins `color-scheme: light`). Declaring
  // both schemes here stops Chrome's forced "auto dark" mode from inverting it.
  colorScheme: "light dark",
  themeColor: "#141a3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={jakarta.variable}>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
