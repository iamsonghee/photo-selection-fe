"use client";
import { useEffect, useState } from "react";
import { LandingVideo } from "./LandingVideo";

export function HeroVideo() {
  // 서버 HTML은 모바일 소스로 시작하고 데스크톱에서만 교체한다.
  const [mobile, setMobile] = useState(true);
  useEffect(() => {
    const viewport = matchMedia("(max-width: 767px)");
    const sync = () => setMobile(viewport.matches);
    sync(); viewport.addEventListener("change", sync);
    return () => viewport.removeEventListener("change", sync);
  }, []);
  const base = `/landing/hero/${mobile ? "acut-demo-mobile" : "acut-demo"}`;
  return <figure id="product-preview" className="ac-preview" tabIndex={-1} aria-labelledby="preview-caption">
    <LandingVideo src={`${base}.mp4`} poster={`${base}-poster.webp`}
      width={mobile ? 960 : 2400} height={mobile ? 1200 : 1282} className="ac-hero-film" priority
      label="고객이 사진 3장을 선택하고 요청을 남기면 작가에게 동일한 사진과 요청이 정리되고 작가가 보정본을 업로드하는 20초 제품 시연"
      alt="휴대폰에서 사진을 선택하고 작가에게 요청을 전달하는 A-CUT 고객 화면" />
    <figcaption id="preview-caption">고객은 사진을 고르고 요청을 남기고, 작가는 선택 결과를 모아 확인합니다.</figcaption>
  </figure>;
}
