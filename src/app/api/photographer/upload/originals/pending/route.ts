const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export const maxDuration = 10;

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id") ?? "";

  const res = await fetch(
    `${BACKEND_URL}/api/upload/originals/pending?project_id=${encodeURIComponent(projectId)}`,
    { headers: { Authorization: auth } },
  );

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
