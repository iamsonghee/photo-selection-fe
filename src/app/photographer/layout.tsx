import type { Viewport } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { ProfileProvider } from "@/contexts/ProfileContext";

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
      <div className="flex min-h-screen bg-[#0d1e28]">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <main className="ml-0 md:ml-[220px] flex-1">{children}</main>
      </div>
    </ProfileProvider>
  );
}
