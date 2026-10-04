import { NextRequest } from "next/server";
import { shareTokenFromRequest } from "@/lib/customer-select-server";

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 업로드(POST)는 브라우저가 BE로 직접 보낸다 — 이 함수를 거치면 Vercel 본문 4.5MB 한도에 막힌다.
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get("Authorization") ?? "";
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.project_id === "string" && !body.share_token) {
    body.share_token = shareTokenFromRequest(req, body.project_id);
  }
  const res = await fetch(`${BACKEND_URL}/api/customer-upload/photos`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}
