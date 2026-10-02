import { Suspense } from "react";
import { CustomerSelectStoreProvider } from "../_lib/real-store";
import theme from "@/styles/AcutLightTheme.module.css";

export default async function CustomerSelectProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className={theme.lightTheme} data-acut-light-canvas data-customer-select>
      <Suspense fallback={null}>
        <CustomerSelectStoreProvider projectId={projectId}>{children}</CustomerSelectStoreProvider>
      </Suspense>
    </div>
  );
}
