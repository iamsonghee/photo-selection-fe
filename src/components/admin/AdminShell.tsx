import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AdminSidebar email={email} />
      <main className="flex-1 overflow-y-auto px-10 py-10">{children}</main>
    </div>
  );
}
