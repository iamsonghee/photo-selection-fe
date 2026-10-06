import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { customerProjectDestination, customerProjectSent } from "../_lib/project-routing";

/**
 * 별도 프로젝트 상세(허브) 화면은 두지 않는다 — 프로젝트를 열면 지금 할 단계로 바로 간다(2026-10-06).
 * 허브가 보여주던 참여자·초대는 프로젝트 화면 공통 헤더가, 촬영 정보·설정·링크 관리는 목록의 상세 보기와 카드 메뉴가 맡는다.
 * 이 주소는 기존 링크·설정 돌아가기 호환용 리다이렉트다. 화면을 그리지 않으므로 페이지가 아니라 라우트 핸들러로 둔다
 * (리다이렉트만 하는 서버 컴포넌트 페이지는 개발 모드에서 React 오류를 냈다, 2026-10-01).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) return NextResponse.redirect(new URL("/customer-select/login", req.url));
  const { projectId } = await params;
  const { data } = await getAdminClient().from("customer_projects")
    .select("id, photo_count, retouch_done, exported, delivery_count")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  // 내 프로젝트가 아니거나 없으면 목록으로 보낸다.
  return NextResponse.redirect(new URL(data ? customerProjectDestination(data, customerProjectSent(data)) : "/customer-select", req.url));
}
