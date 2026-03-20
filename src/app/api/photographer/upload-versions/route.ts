import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

/**
 * 보정본 업로드를 백엔드로 프록시 (같은 origin 요청으로 CORS 회피)
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice("Bearer ".length);
  const dotCount = (token.match(/\./g) ?? []).length;
  console.error(
    `[upload-versions proxy] hasToken=${Boolean(token)} dotCount=${dotCount} isJwtLike=${dotCount === 2} preview=${token ? `${token.slice(0, 20)}...` : "(empty)"}`
  );
  console.log("[upload-versions proxy] auth token shape", {
    hasToken: Boolean(token),
    dotCount,
    isJwtLike: dotCount === 2,
    tokenPreview: token ? `${token.slice(0, 20)}...` : "(empty)",
  });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${BACKEND_URL}/api/upload/versions`, {
      method: "POST",
      headers: { Authorization: auth },
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      const snippet = text.slice(0, 300);
      data = {
        error: "서버가 예기치 않은 형식으로 응답했습니다.",
        detail: res.status >= 500 ? "백엔드 오류일 수 있습니다. 터미널 로그를 확인하세요." : undefined,
        raw: snippet,
      };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("upload-versions proxy error:", e);
    const detail =
      e instanceof Error && e.name === "AbortError"
        ? "백엔드 응답 시간이 초과되었습니다. 서버 상태를 확인한 뒤 다시 시도해주세요."
        : `백엔드 연결 실패: ${BACKEND_URL}`;
    return NextResponse.json(
      { error: "백엔드에 연결할 수 없습니다.", detail },
      { status: 502 }
    );
  }
}
