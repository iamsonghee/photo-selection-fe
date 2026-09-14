"use client";
import { LandingVideo } from "./LandingVideo";
const BASE = "/landing/review/acut-review";
/** 히어로와 같은 재생 정책을 사용하며 운영 API는 호출하지 않는다. */
export function ReviewVideo() {
  return <LandingVideo src={`${BASE}.mp4`} poster={`${BASE}-poster.webp`}
    width={2400} height={1440} className="as-review-film"
    label="원본 보기 버튼을 2초씩 두 번 누르고 사진별 요청을 남기는 12초 시연"
    alt="보정본을 원본과 비교하고 사진별 재보정 요청을 남기는 A-CUT 검토 화면" />;
}
