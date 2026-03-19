import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

/**
 * OAuth 콜백 Route Handler
 * Supabase가 구글 로그인 후 리다이렉트할 때 호출됩니다.
 * photographers 테이블에 auth_id = user.id 인 레코드 없으면 INSERT (auth_id, email).
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/photographer/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/auth", requestUrl.origin));
  }

  const supabase = await createClient();
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[Auth Callback] exchangeCodeForSession error:", error);
    return NextResponse.redirect(new URL("/auth?error=" + encodeURIComponent(error.message), requestUrl.origin));
  }

  const user = sessionData?.user;
  if (user?.id) {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("photographers")
      .select("id")
      .eq("auth_id", user.id)
      .limit(1)
      .single();
    if (!existing) {
      await admin.from("photographers").insert({
        auth_id: user.id,
        email: user.email ?? null,
      });
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
