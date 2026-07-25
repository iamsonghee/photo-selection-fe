const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export const maxDuration = 10;

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const formData = await req.formData();

  const res = await fetch(`${BACKEND_URL}/api/upload/originals/confirm`, {
    method: "POST",
    headers: { Authorization: auth },
    body: formData,
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
