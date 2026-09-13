import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/admin-emails";

const COOKIE_TTL_SECONDS = 86400;

type CustomerPinLookup =
  | { found: true; accessPin: string | null }
  | { found: false };

/**
 * /admin/** 접근 제어를 미들웨어(Edge, 렌더링 시작 전)에서 수행한다.
 * App Router에서 layout과 그 자식 page는 병렬로 렌더링될 수 있어, layout의 redirect()만으로는
 * 자식 page의 데이터 페칭이 이미 시작돼 RSC 스트림에 실려 나가는 것을 막지 못한다(실측 확인됨 —
 * 인증 없이 /admin/projects를 raw HTTP로 요청하면 200 + 실제 프로젝트/이메일 데이터가 응답 본문에
 * 포함됨. 실제 브라우저는 클라이언트 라우터가 이 데이터를 받은 후 곧바로 "/"로 다시 이동시켜
 * 화면에는 안 보이지만, 그 사이 데이터는 이미 네트워크로 전송된 뒤다). 미들웨어는 React 렌더링
 * 자체를 시작하기 전에 진짜 HTTP 리다이렉트를 보내므로 이 문제가 원천적으로 발생하지 않는다.
 * (`src/app/admin/layout.tsx`의 getAdminUser() 체크는 이메일 표시 등 UI 편의 목적으로 유지한다.)
 */
async function handleAdminGate(req: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession()이 아니라 getUser()를 써야 한다 — getUser()는 Supabase Auth 서버에 재검증을
  // 요청해 쿠키 위조를 막는다(공식 권장 패턴).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL("/photographer/dashboard", req.url));
  }

  return response;
}

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
  cookieValue: string,
  accessPin: string | null,
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
      enc.encode(`${token}:${accessPin === null ? "none" : `pin:${accessPin}`}:${timestamp}`)
    );
  } catch {
    return false;
  }
}

async function signPinCookieEdge(token: string, accessPin: string | null): Promise<string> {
  const secret = process.env.PIN_COOKIE_SECRET;
  if (!secret) throw new Error("PIN_COOKIE_SECRET is not set");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${token}:${accessPin === null ? "none" : `pin:${accessPin}`}:${timestamp}`)
  );
  const base64url = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${timestamp}.${base64url}`;
}

async function getCustomerPin(token: string): Promise<CustomerPinLookup> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase admin env is not set");

  const endpoint = new URL("/rest/v1/projects", url);
  endpoint.searchParams.set("select", "access_pin");
  endpoint.searchParams.set("access_token", `eq.${token}`);
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`customer PIN lookup failed: ${response.status}`);

  const rows = (await response.json()) as Array<{ access_pin: string | null }>;
  if (!rows[0]) return { found: false };
  return { found: true, accessPin: rows[0].access_pin };
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return handleAdminGate(req);
  }

  // Extract token from /c/[token] and all nested customer routes.
  const match = pathname.match(/^\/c\/([^/]+)(?:\/(.*))?$/);
  if (!match) return NextResponse.next();

  const token = match[1];
  const subpath = match[2] ?? "";

  // Allow access to the pin page itself
  if (subpath === "pin" || subpath.startsWith("pin?")) {
    return NextResponse.next();
  }

  const cookieName = `pin_verified_${token}`;
  const cookieValue = req.cookies.get(cookieName)?.value;

  try {
    const project = await getCustomerPin(token);
    if (
      project.found &&
      cookieValue &&
      (await verifyPinCookieEdge(token, cookieValue, project.accessPin))
    ) {
      return NextResponse.next();
    }
    if (project.found && project.accessPin === null) {
      // PIN 없는 링크는 /pin → /api/c/auto-verify 왕복 없이 현재 요청에서 바로 인증한다.
      const signedCookie = await signPinCookieEdge(token, null);
      // 현재 Server Component 요청도 즉시 인증된 쿠키를 보도록 request/response 양쪽에 반영한다.
      req.cookies.set(cookieName, signedCookie);
      const response = NextResponse.next({ request: req });
      response.cookies.set(cookieName, signedCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_TTL_SECONDS,
        path: "/",
      });
      return response;
    }

    // 존재하는 PIN 보호 프로젝트는 기존 입력 화면으로 보낸다.
    if (project.found) {
      const pinUrl = new URL(`/c/${token}/pin`, req.url);
      pinUrl.searchParams.set("from", pathname + req.nextUrl.search);
      return NextResponse.redirect(pinUrl);
    }
  } catch (error) {
    // 인증 조회 장애 시 보호된 하위 경로를 열지 않는 기존 fail-closed 동작을 유지한다.
    console.error("[middleware/customer-pin]", error);
  }

  // 유효하지 않은 루트 링크는 페이지의 기존 INVALID_TOKEN 화면이 처리한다.
  if (subpath === "") return NextResponse.next();

  const pinUrl = new URL(`/c/${token}/pin`, req.url);
  pinUrl.searchParams.set("from", pathname + req.nextUrl.search);
  return NextResponse.redirect(pinUrl);
}

export const config = {
  matcher: ["/c/:token", "/c/:token/:path+", "/admin", "/admin/:path*"],
};
