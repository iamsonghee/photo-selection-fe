"use client";

/**
 * 고객 셀렉 서비스 로그인 진입. 기존 AuthModal(작가용, 사이버펑크 톤)은 이 서비스의
 * "일반 고객이 쓰기 쉬운 단순한 UI" 목표와 톤이 맞지 않아 재사용하지 않고, customer-select
 * 디자인 톤으로 새로 그린다(단계 0 결정) — signInWithOAuth 호출 로직 자체는
 * useOAuthLogin 훅으로 AuthModal과 공유한다.
 */
import { setPostLoginRedirect } from "@/lib/post-login-redirect";
import { useOAuthLogin } from "@/hooks/useOAuthLogin";
import { BrandLogoBar } from "@/components/BrandLogo";
import ui from "../_lib/ui.module.css";

export default function CustomerSelectLoginPage() {
  const { loading, error, login } = useOAuthLogin();

  function handleLogin(provider: "google" | "kakao") {
    setPostLoginRedirect("/customer-select/new");
    login(provider);
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" variant="customerEntry" />
      </header>
      <div className={ui.shellMain}>
        <div className={ui.page} style={{ minHeight: "unset" }}>
          <div className={ui.body} style={{ paddingTop: 40 }}>
            <h1 className={ui.entryTitle}>내 셀렉 프로젝트 시작하기</h1>
            <p className={ui.bodyText}>사진을 올리고, 고르고, 작가님께 전달할 목록을 만들어요.</p>
            {error && <span className={ui.bannerHeadWarn}>{error}</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} disabled={loading !== null} onClick={() => handleLogin("google")}>
                {loading === "google" ? "이동 중…" : "Google로 시작하기"}
              </button>
              <button type="button" className={ui.btn} disabled={loading !== null} onClick={() => handleLogin("kakao")}>
                {loading === "kakao" ? "이동 중…" : "Kakao로 시작하기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
