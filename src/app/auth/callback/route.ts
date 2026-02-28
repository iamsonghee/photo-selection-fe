import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * OAuth 콜백 Route Handler
 * Supabase가 구글 로그인 후 리다이렉트할 때 호출됩니다.
 * code_verifier는 @supabase/ssr의 쿠키에 저장되어 있어 여기서 exchange 가능합니다.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/photographer/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/auth", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[Auth Callback] exchangeCodeForSession error:", error);
    return NextResponse.redirect(new URL("/auth?error=" + encodeURIComponent(error.message), requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
