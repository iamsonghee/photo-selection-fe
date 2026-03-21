import { Sidebar } from "@/components/layout/Sidebar";
import { ProfileProvider } from "@/contexts/ProfileContext";

export default function PhotographerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <div className="flex min-h-screen bg-[#0d1e28]">
        <Sidebar />
        <main className="ml-[220px] flex-1">{children}</main>
      </div>
    </ProfileProvider>
  );
}
