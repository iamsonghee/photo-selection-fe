import { NextRequest, NextResponse } from "next/server";

const COOKIE_TTL_SECONDS = 86400;

function base64urlToBuffer(s: string): ArrayBuffer {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    base64.length % 4 ? base64 + "=".repeat(4 - (base64.length % 4)) : base64;
  const binary = atob(padded);
  const ab = new ArrayBuffer(binary.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return ab;
}

async function verifyPinCookieEdge(
  token: string,
  cookieValue: string
): Promise<boolean> {
  const secret = process.env.PIN_COOKIE_SECRET;
  if (!secret) return false;

  const dot = cookieValue.indexOf(".");
  if (dot < 1) return false;
  const timestamp = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!timestamp || !sig) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  if (Math.floor(Date.now() / 1000) - ts > COOKIE_TTL_SECONDS) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBuffer(sig),
      enc.encode(`${token}:${timestamp}`)
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Extract token from /c/[token]/...
  const match = pathname.match(/^\/c\/([^/]+)\/(.+)$/);
  if (!match) return NextResponse.next();

  const token = match[1];
  const subpath = match[2];

  // Allow access to the pin page itself
  if (subpath === "pin" || subpath.startsWith("pin?")) {
    return NextResponse.next();
  }

  const cookieName = `pin_verified_${token}`;
  const cookieValue = req.cookies.get(cookieName)?.value;

  if (!cookieValue || !(await verifyPinCookieEdge(token, cookieValue))) {
    const pinUrl = new URL(`/c/${token}/pin`, req.url);
    // pathname만 넘기면 원래 URL의 쿼리스트링(예: 뷰어의 ?grouped=1, 필터 파라미터)이
    // PIN 인증 후 복귀 시 유실된다 — search까지 함께 보존한다.
    pinUrl.searchParams.set("from", pathname + req.nextUrl.search);
    return NextResponse.redirect(pinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/c/:token/:path+"],
};
