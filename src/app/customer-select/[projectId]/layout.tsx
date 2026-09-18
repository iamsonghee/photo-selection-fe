import { CustomerSelectStoreProvider } from "../_lib/mock-store";

export default async function CustomerSelectProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <CustomerSelectStoreProvider projectId={projectId}>{children}</CustomerSelectStoreProvider>;
}
