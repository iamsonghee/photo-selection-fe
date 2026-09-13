const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/upload/originals/presign`, {
      method: "POST",
      headers: { Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
      body: JSON.stringify(await req.json()),
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    // Rolling deploy / optional optimization failure: keep the established /photos path usable.
    return Response.json({ detail: "early_original_upload_unavailable" }, { status: 503 });
  }
}
