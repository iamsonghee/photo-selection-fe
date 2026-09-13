"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/AuthModal";
import { createClient } from "@/lib/supabase/client";
import { ArrowDown, ArrowRight } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { LandingStory } from "./LandingStory";
import { SentenceText } from "./SentenceText";
import { HeroVideo } from "./HeroVideo";

interface PlanLimits {
  generalMaxProjects: number;
  generalMaxPhotosPerProject: number;
  betaMaxProjectsTotal: number;
  betaMaxPhotosPerProject: number;
}

export function LandingPageClient({ limits }: { limits: PlanLimits }) {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  // 무료 시작을 누른 경우에만 세션을 확인한다. 샘플 체험은 별도 링크로 유지한다.
  const handleStart = async () => {
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (session) {
        router.push("/photographer/dashboard");
        return;
      }
    } catch {
      // 세션 확인에 실패해도 기존 로그인 화면에서 다시 시작할 수 있다.
    }
    setAuthOpen(true);
  };

  return (
    <>
      <div className="ac-landing">
        <a className="ac-skip" href="#landing-main">본문 바로가기</a>
        <header className="ac-header">
          <div className="ac-container ac-header-inner">
            <BrandLogoBar href="/" variant="customerEntry" />
            <nav aria-label="주 메뉴"><Link prefetch={false} href="/beta/apply">베타 신청 <ArrowRight size={14} /></Link></nav>
            <button type="button" className="ac-button ac-button-small" onClick={handleStart}>무료 시작하기<ArrowRight size={15} /></button>
          </div>
        </header>
        <main id="landing-main" tabIndex={-1}>
          <section className="ac-hero ac-container" aria-labelledby="hero-title">
            <div className="ac-hero-copy">
              <p className="ac-eyebrow"><span /> 사진작가를 위한 고객 셀렉 · 보정 피드백</p>
              <h1 id="hero-title">사진 셀렉부터<br /><span>보정본 확정까지,</span> 한곳에서.</h1>
              <p className="ac-hero-description"><SentenceText>사진을 올리고 고객에게 링크를 공유하세요. 선택 결과와 요청 확인부터 보정본 확정까지 이어가세요.</SentenceText></p>
              <div className="ac-hero-actions"><button type="button" className="ac-button" onClick={handleStart}>무료 시작하기<ArrowRight size={18} /></button><a className="ac-button ac-button-secondary" href="#selection-demo">고객 셀렉 체험하기<ArrowDown size={17} /></a></div>
              <p className="ac-trial-note">무료로 프로젝트 {limits.generalMaxProjects}개, 프로젝트당 최대 {limits.generalMaxPhotosPerProject.toLocaleString()}장까지 시작할 수 있어요.</p>
            </div>
            <HeroVideo />

          </section>
          <LandingStory limits={limits} onStart={handleStart} />
        </main>
        {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} redirectPath="/photographer/dashboard" />}
        <footer className="ac-footer"><div className="ac-container ac-footer-inner"><BrandLogoBar size="sm" variant="customerEntry" /><p>사진에 집중할 수 있도록.</p><Link prefetch={false} href="/beta/apply">클로즈드 베타 신청<ArrowRight size={14} /></Link><small>© {new Date().getFullYear()} A-CUT</small></div></footer>
      </div>
    </>
  );
}
