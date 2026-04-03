import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

/**
 * PIN 없는 프로젝트에서 미들웨어를 통과할 수 있도록 pin_verified 쿠키를 자동 발급.
 * pin/page.tsx (서버 컴포넌트)에서 access_pin === null 일 때 이 라우트로 리다이렉트.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const to = searchParams.get("to") ?? "/";

  if (!token) return NextResponse.redirect(new URL("/", req.url));

  const admin = getAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("access_pin")
    .eq("access_token", token)
    .single();

  if (error || !project) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const accessPin = (project as { access_pin: string | null }).access_pin;

  if (accessPin !== null) {
    // 실제로 PIN이 있는 프로젝트 → PIN 페이지로 (비정상 접근 방어)
    const pinUrl = new URL(`/c/${token}/pin`, req.url);
    pinUrl.searchParams.set("from", to);
    return NextResponse.redirect(pinUrl);
  }

  // PIN 없음 → 쿠키 발급 후 원래 페이지로
  const cookieName = `pin_verified_${token}`;
  const response = NextResponse.redirect(new URL(to, req.url));
  response.cookies.set(cookieName, "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
    path: "/",
  });
  return response;
}
