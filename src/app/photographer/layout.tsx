import type { Viewport } from "next";
import { PhotographerDesktopShell } from "@/components/layout/PhotographerDesktopShell";
import { ProfileProvider } from "@/contexts/ProfileContext";
import "./photographer.css";

/** Next.js App Router: generates the same as meta viewport width=device-width, initial-scale=1, maximum-scale=1 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function PhotographerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <div className="photographer-app relative flex min-h-screen bg-[#050505] text-zinc-100">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          aria-hidden
        >
          <div className="absolute -left-24 top-[8%] h-72 w-72 rounded-full bg-[#4f7eff]/15 blur-[100px]" />
          <div
            className="absolute right-[-15%] top-[35%] h-64 w-64 rounded-full bg-violet-500/10 blur-[90px]"
          />
        </div>
        <PhotographerDesktopShell>{children}</PhotographerDesktopShell>
      </div>
    </ProfileProvider>
  );
}
