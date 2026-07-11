import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_TTL_SECONDS = 86400; // 24 hours

function getSecret(): string {
  const s = process.env.PIN_COOKIE_SECRET;
  if (!s) throw new Error("PIN_COOKIE_SECRET is not set");
  return s;
}

export function signPinCookie(token: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", getSecret())
    .update(`${token}:${timestamp}`)
    .digest("base64url");
  return `${timestamp}.${sig}`;
}

export function verifyPinCookie(token: string, cookieValue: string): boolean {
  try {
    const dot = cookieValue.indexOf(".");
    if (dot < 1) return false;
    const timestamp = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    if (!timestamp || !sig) return false;

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    if (Math.floor(Date.now() / 1000) - ts > COOKIE_TTL_SECONDS) return false;

    const expected = createHmac("sha256", getSecret())
      .update(`${token}:${timestamp}`)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function checkPinAuth(
  req: NextRequest,
  token: string
): NextResponse | null {
  const cookieName = `pin_verified_${token}`;
  const cookieValue = req.cookies.get(cookieName)?.value;
  if (!cookieValue || !verifyPinCookie(token, cookieValue)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
