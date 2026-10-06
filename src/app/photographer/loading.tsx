import { PhotographerPageSkeleton } from "@/components/photographer/PhotographerPageSkeleton";

/** 작가 구간의 라우트 로딩 — 사이드바 셸 안 본문 자리에 골격만 둔다(흰 전체 화면 부팅 화면은 쓰지 않는다). */
export default function PhotographerLoading() {
  return <PhotographerPageSkeleton />;
}
