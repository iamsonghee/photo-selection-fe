const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const contentType = req.headers.get("Content-Type") ?? "";

  const res = await fetch(`${BACKEND_URL}/api/upload/photos`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": contentType,
    },
    body: req.body as unknown as BodyInit,
  } as RequestInit);

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
