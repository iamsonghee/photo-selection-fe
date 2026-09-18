import { NextRequest, NextResponse } from "next/server";
import { checkPinAuth } from "@/lib/customer-auth-server";

/**
 * 이 라우트는 더 이상 지원되지 않는 예전 검토 제출 방식이다(`/api/c/review/submit`으로 대체됨).
 * 실사용 토큰은 항상 DB에 있으므로 여기 도달하면 무조건 410을 반환한다 — mock 폴백은
 * 프로토타입 시절 코드라 실제로는 도달할 수 없어 제거했다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? req.nextUrl.searchParams.get("token")) as string | undefined;
    const result = body.result as string | undefined; // 'all_approved' | 'has_revision'

    if (!token?.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    if (!result || !["all_approved", "has_revision"].includes(result)) {
      return NextResponse.json({ error: "result must be all_approved or has_revision" }, { status: 400 });
    }
    const pinErr = await checkPinAuth(req, token);
    if (pinErr) return pinErr;

    return NextResponse.json(
      { error: "이 검토 제출 방식은 더 이상 지원되지 않습니다. 페이지를 새로고침해 주세요." },
      { status: 410 },
    );
  } catch (e) {
    console.error("[api/c/review-submit]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
