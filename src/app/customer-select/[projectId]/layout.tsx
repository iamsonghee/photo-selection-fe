import { Suspense } from "react";
import { CustomerSelectStoreProvider } from "../_lib/real-store";

export default async function CustomerSelectProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={null}>
      <CustomerSelectStoreProvider projectId={projectId}>{children}</CustomerSelectStoreProvider>
    </Suspense>
  );
}
