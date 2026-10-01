import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { customerProjectDestination, type CustomerProjectSummary } from "../_lib/project-routing";

/**
 * 별도 "프로젝트 현황" 화면은 두지 않는다 — 프로젝트를 열면 지금 해야 할 단계로 바로 간다.
 * 초대·참여 현황은 고르기 화면의 초대 시트, 촬영 정보는 설정에서 다룬다. 기존 링크 호환용 리다이렉트.
 * (화면을 그리지 않는 리다이렉트라 페이지가 아니라 라우트 핸들러로 둔다.)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) return NextResponse.redirect(new URL("/customer-select/login", req.url));
  const { projectId } = await params;
  const { data } = await getAdminClient().from("customer_projects")
    .select("id, photo_count, retouch_done")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  // 내 프로젝트가 아니거나 없으면 목록으로 보낸다.
  return NextResponse.redirect(new URL(data ? customerProjectDestination(data as CustomerProjectSummary) : "/customer-select", req.url));
}
