import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
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
  const verified = req.cookies.get(cookieName);

  if (!verified) {
    const pinUrl = new URL(`/c/${token}/pin`, req.url);
    pinUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(pinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/c/:token/:path+"],
};
