const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";

  // Parse FormData from the incoming request and forward it.
  // Do NOT set Content-Type manually — fetch sets it automatically
  // with the correct multipart boundary.
  const formData = await req.formData();

  const res = await fetch(`${BACKEND_URL}/api/upload/photos`, {
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
