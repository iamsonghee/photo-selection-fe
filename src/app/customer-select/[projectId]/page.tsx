import { redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { ProjectHome } from "./ProjectHome";

/**
 * 프로젝트 상세 — 목록 카드와 헤더 프로젝트명이 여는 곳. 지금 할 단계로 가는 주 버튼과 진행 상황·장면·참여자·촬영 정보를 보여준다.
 * 소유자만 본다(참여자는 공유 링크로 고르기 화면에 바로 들어간다). 보정 완료 여부는 프로젝트 조회에 없어 여기서 읽는다.
 */
export default async function CustomerProjectHomePage({ params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const { projectId } = await params;
  const { data } = await getAdminClient().from("customer_projects")
    .select("id, retouch_done")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  // 내 프로젝트가 아니거나 없으면 목록으로 보낸다.
  if (!data) redirect("/customer-select");
  return <ProjectHome projectId={projectId} retouchDone={Boolean(data.retouch_done)} />;
}
