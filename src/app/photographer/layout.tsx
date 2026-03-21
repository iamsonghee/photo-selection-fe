import { Sidebar } from "@/components/layout/Sidebar";
import { ProfileProvider } from "@/contexts/ProfileContext";

export default function PhotographerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <div className="flex min-h-screen bg-[#0a0b0d]">
        <Sidebar />
        <main className="ml-[200px] flex-1 p-6">{children}</main>
      </div>
    </ProfileProvider>
  );
}
