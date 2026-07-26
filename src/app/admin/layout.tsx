import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAdminUser();

  if (result.status === "unauthenticated") redirect("/");
  if (result.status === "forbidden") redirect("/photographer/dashboard");

  return <AdminShell email={result.email}>{children}</AdminShell>;
}
