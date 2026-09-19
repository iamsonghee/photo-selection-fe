const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const maxDuration = 60;

/** 순수 프록시 — 브라우저가 보낸 Authorization(소유자 JWT)과 share_token(참가자) 폼필드를 그대로 전달. */
export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const formData = await req.formData();
  const res = await fetch(`${BACKEND_URL}/api/customer-upload/photos`, {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
    body: formData,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function DELETE(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const body = await req.text();
  const res = await fetch(`${BACKEND_URL}/api/customer-upload/photos`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}
