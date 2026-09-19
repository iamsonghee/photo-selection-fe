"use client";

import { setPostLoginRedirect } from "@/lib/post-login-redirect";
import { useOAuthLogin } from "@/hooks/useOAuthLogin";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";

export function CustomerSelectLoginButtons() {
  const { loading, error, login } = useOAuthLogin();

  function handleLogin(provider: "google" | "kakao") {
    setPostLoginRedirect("/customer-select");
    login(provider);
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      {error ? <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p> : null}
      <PhotographerLightButton size="confirmation" pending={loading === "google"} pendingLabel="Google로 이동 중…" onClick={() => handleLogin("google")}>
        Google로 시작하기
      </PhotographerLightButton>
      <PhotographerLightButton variant="outline" size="confirmation" pending={loading === "kakao"} pendingLabel="Kakao로 이동 중…" onClick={() => handleLogin("kakao")}>
        Kakao로 시작하기
      </PhotographerLightButton>
    </div>
  );
}
