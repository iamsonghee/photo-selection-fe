const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

/** 대용량 원본 업로드(여러 장) 시 서버리스 타임아웃 완화 — 플랜별 상한은 호스팅 정책 따름 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";

  console.log("[proxy/upload] BACKEND_URL:", BACKEND_URL);
  console.log("[proxy/upload] BACKEND_URL env:", process.env.BACKEND_URL);

  const formData = await req.formData();

  const targetUrl = `${BACKEND_URL}/api/upload/photos`;
  console.log("[proxy/upload] forwarding to:", targetUrl);

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { Authorization: auth },
    body: formData,
  });

  console.log("[proxy/upload] backend response status:", res.status);

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
