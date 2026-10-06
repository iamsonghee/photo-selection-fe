import { Suspense } from "react";
import { CustomerSelectStoreProvider } from "../_lib/real-store";
import { ProjectShellProvider } from "../_lib/ProjectShell";

export default async function CustomerSelectProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <CustomerSelectStoreProvider projectId={projectId}>
      {/* 헤더(프로젝트명·단계·참여자·초대)는 여기서 한 번만 그려 화면을 오가도 유지한다. 서버 페이지가 준비되는 동안은 본문만 빈다. */}
      <ProjectShellProvider>
        <Suspense fallback={<main className="flex-1" aria-busy="true" />}>{children}</Suspense>
      </ProjectShellProvider>
    </CustomerSelectStoreProvider>
  );
}
