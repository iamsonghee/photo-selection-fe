import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import InvitePageWrapper from "./InvitePageWrapper";
import { getProjectByTokenCached } from "@/lib/customer-api-server";
import { verifyPinCookie } from "@/lib/customer-auth-server";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) return <InvitePageWrapper />;

  const project = await getProjectByTokenCached(token);
  const status = project?.status;

  // PIN 인증 체크 — 미들웨어가 현재 요청에 발급한 무PIN 쿠키도 여기서 동일하게 검증한다.
  if (project) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(`pin_verified_${token}`)?.value;
    if (!cookieValue || !verifyPinCookie(token, cookieValue, project.accessPin ?? null)) {
      redirect(`/c/${token}/pin?from=${encodeURIComponent(`/c/${token}`)}`);
    }
  }

  // 클라이언트 데이터 hydration 뒤 이동하지 않도록 서버에서 동일한 상태 라우팅을 확정한다.
  // editing/editing_v2는 여기서 튕기지 않는다 — InvitePageWrapper가 이 상태 전용 화면(검토
  // CTA 비활성 + 원본 다운로드 유지)을 직접 그린다. /locked에서 로고를 눌러 돌아오는
  // 유일한 목적지이므로, 여기서 다시 /locked로 되돌리면 로고 클릭이 항상 no-op이 된다.
  if (status === "confirmed") redirect(`/c/${token}/confirmed`);
  if (status === "delivered") redirect(`/c/${token}/delivered`);

  return <InvitePageWrapper />;
}
