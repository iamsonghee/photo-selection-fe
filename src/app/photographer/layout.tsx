import { Sidebar } from "@/components/layout/Sidebar";

export default function PhotographerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#0a0b0d]">
      <Sidebar />
      <main className="ml-[200px] flex-1 p-6">{children}</main>
    </div>
  );
}
