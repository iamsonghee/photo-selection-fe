import { NextRequest } from "next/server";
import { shareTokenFromRequest } from "@/lib/customer-select-server";

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const maxDuration = 60;

/** 소유자 JWT는 그대로, 참가자 토큰은 HttpOnly 공유 쿠키에서 꺼내 BE에만 전달한다. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization") ?? "";
  const formData = await req.formData();
  const projectId = formData.get("project_id");
  if (typeof projectId === "string" && !formData.has("share_token")) {
    const shareToken = shareTokenFromRequest(req, projectId);
    if (shareToken) formData.append("share_token", shareToken);
  }
  const res = await fetch(`${BACKEND_URL}/api/customer-upload/photos`, {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
    body: formData,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}

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
