import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { mapProjectRow } from "@/lib/customer-api-server";
import type { Database } from "@/types/supabase";
import type { Project } from "@/types";

type ProjectsRow = Database["public"]["Tables"]["projects"]["Row"];

const COOKIE_TTL_SECONDS = 86400; // 24 hours

function getSecret(): string {
  const s = process.env.PIN_COOKIE_SECRET;
  if (!s) throw new Error("PIN_COOKIE_SECRET is not set");
  return s;
}

function pinSignatureScope(accessPin: string | null): string {
  return accessPin === null ? "none" : `pin:${accessPin}`;
}

export function signPinCookie(token: string, accessPin: string | null): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", getSecret())
    .update(`${token}:${pinSignatureScope(accessPin)}:${timestamp}`)
    .digest("base64url");
  return `${timestamp}.${sig}`;
}

export function verifyPinCookie(
  token: string,
  cookieValue: string,
  accessPin: string | null,
): boolean {
  try {
    const dot = cookieValue.indexOf(".");
    if (dot < 1) return false;
    const timestamp = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    if (!timestamp || !sig) return false;

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    if (Math.floor(Date.now() / 1000) - ts > COOKIE_TTL_SECONDS) return false;

    const expectedRaw = createHmac("sha256", getSecret())
      .update(`${token}:${pinSignatureScope(accessPin)}:${timestamp}`)
      .digest();

    const sigRaw = Buffer.from(sig, "base64url");
    if (sigRaw.length !== expectedRaw.length) return false;
    return timingSafeEqual(sigRaw, expectedRaw);
  } catch {
    return false;
  }
}

export async function checkPinAuth(
  req: NextRequest,
  token: string
): Promise<NextResponse | null> {
  const result = await getPinAuthorizedProject(req, token);
  return result.error;
}

/**
 * PIN 인증과 프로젝트 조회를 한 번의 DB 조회로 처리한다.
 * 프로젝트 데이터가 필요한 API가 checkPinAuth 뒤에 token→project를 다시 조회하던 왕복을
 * 피할 수 있도록, 인증에 쓴 그 행을 그대로 전체 Project로 매핑해 반환한다.
 */
export async function getPinAuthorizedProject(
  req: NextRequest,
  token: string
): Promise<{ project: Project | null; error: NextResponse | null }> {
  const cookieName = `pin_verified_${token}`;
  const cookieValue = req.cookies.get(cookieName)?.value;
  if (!cookieValue) {
    return {
      project: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = getAdminClient();
  const { data: row, error } = await admin
    .from("projects")
    .select("*")
    .eq("access_token", token)
    .limit(1)
    .maybeSingle();
  if (error || !row) {
    return {
      project: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const project = mapProjectRow(row as ProjectsRow);
  if (!verifyPinCookie(token, cookieValue, project.accessPin ?? null)) {
    return {
      project: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { project, error: null };
}
