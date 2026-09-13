import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    /* `lg` 미만에서는 세로로 쌓는다 — AdminSidebar가 이 폭에서는 상단 바 + 드로어로 스스로
     * 바뀌므로, 여기서는 사이드바 폭을 전제한 좌우 배치를 걷어내기만 하면 된다.
     * `main` 패딩도 모바일에서는 40px가 아니라 16/24px로 줄인다 — 폭이 좁을수록
     * 여백이 콘텐츠를 더 크게 깎아 먹는다. */
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      <AdminSidebar email={email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
