import { Suspense } from "react";
import { CustomerSelectStoreProvider } from "../_lib/real-store";
import { ProjectShellProvider } from "../_lib/ProjectShell";
import { ProjectBodySkeleton } from "../_lib/ProjectBodySkeleton";

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
      {/* 헤더(프로젝트명·단계·참여자·초대)는 화면을 오가도 유지하고, 서버 페이지가 준비되는 동안 본문에 골격을 보여준다. */}
      <ProjectShellProvider>
        <Suspense fallback={<ProjectBodySkeleton variant="cards" label="프로젝트를 불러오고 있어요" />}>{children}</Suspense>
      </ProjectShellProvider>
    </CustomerSelectStoreProvider>
  );
}
