const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const maxDuration = 60;

/** 순수 프록시 — /api/customer-select/upload/photos와 동일 패턴, 대상 엔드포인트만 다르다. */
export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const formData = await req.formData();
  const res = await fetch(`${BACKEND_URL}/api/customer-upload/retouched`, {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
    body: formData,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}
