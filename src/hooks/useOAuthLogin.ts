"use client";

/**
 * AuthModal(작가)과 고객 셀렉 로그인 화면이 똑같이 필요로 하는 signInWithOAuth 호출
 * 로직만 공유한다. "로그인 후 어디로 갈지"(setPostLoginRedirect 호출 시점·조건)는
 * 화면마다 다르므로 훅 밖(호출부)에서 login() 전에 결정한다.
 */
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_OAUTH_QUERY_PARAMS } from "@/lib/google-oauth";

export type OAuthProvider = "google" | "kakao";

export function useOAuthLogin() {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function login(provider: OAuthProvider) {
    setError(null);
    setLoading(provider);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
      setError("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정한 뒤 개발 서버를 재시작해 주세요.");
      setLoading(null);
      return;
    }
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options:
          provider === "google"
            ? { redirectTo, queryParams: GOOGLE_OAUTH_QUERY_PARAMS }
            : { redirectTo, scopes: "profile_nickname profile_image" },
      });
      if (err) {
        setError(err.message);
        setLoading(null);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError(`로그인 URL을 받지 못했습니다. Supabase ${provider === "google" ? "Google" : "Kakao"} Provider 설정을 확인하세요.`);
        setLoading(null);
      }
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
      setLoading(null);
    }
  }

  function reset() {
    setLoading(null);
    setError(null);
  }

  return { loading, error, login, clearError: () => setError(null), reset };
}
