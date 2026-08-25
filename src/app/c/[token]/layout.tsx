import type { Metadata } from "next";
import { after } from "next/server";
import CustomerLayoutClient from "./CustomerLayoutClient";
import { getProjectByTokenCached } from "@/lib/customer-api-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { recordBetaUsageEvent } from "@/lib/beta-usage-events";
import "./customer-shell.css";

/** 고객 링크 구간: 루트(작가용) 타이틀을 덮어 브라우저 탭·공유 미리보기를 고객 톤으로 통일 */
export const metadata: Metadata = {
  title: {
    default: "A-CUT | 셀렉·보정을 한 곳에서",
    template: "%s | A-CUT",
  },
  description:
    "갤러리에서 사진을 고르고 확정·보정 요청까지. 링크 하나로 셀렉·보정을 한 곳에서 진행하세요.",
};

export default async function CustomerTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 고객이 링크에 실제로 접속했는지(프로젝트당 최초 1회만, 유니크 인덱스로 멱등) — 베타 사용 행동
  // 관찰용. /pin, /gallery, /viewer/[photoId] 등 모든 하위 경로가 이 레이아웃을 거치므로, 인덱스
  // (/c/[token])가 아니라 여기서 기록해야 딥링크(예: 북마크된 /gallery 직접 진입)도 놓치지 않는다.
  // App Router는 같은 동적 세그먼트 하위의 클라이언트 내비게이션에서 layout을 재실행하지 않으므로,
  // 사진 클릭 등 내부 이동마다 매번 실행되지는 않는다(레이아웃 최초 진입 시에만 실행).
  // Next after()가 응답 이후 실행을 보장하므로 최초 화면을 이벤트 insert 완료까지 막지 않는다.
  if (token) {
    const admin = getAdminClient();
    const project = await getProjectByTokenCached(token);
    if (project) {
      after(async () => {
        await recordBetaUsageEvent(admin, {
          eventType: "customer_link_visited",
          photographerId: project.photographerId,
          projectId: project.id,
        });
      });
    }
  }

  return <CustomerLayoutClient>{children}</CustomerLayoutClient>;
}
