import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_RESULT_COOKIE_MAX_AGE,
  customerResultCookieName,
  verifyCustomerResultToken,
} from "@/lib/customer-select-result-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const token = req.nextUrl.searchParams.get("result_token") ?? "";
  const destination = new URL(`/customer-select/result/${projectId}`, req.url);
  if (!verifyCustomerResultToken(projectId, token)) return NextResponse.redirect(destination);

  const response = NextResponse.redirect(destination);
  response.cookies.set(customerResultCookieName(projectId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CUSTOMER_RESULT_COOKIE_MAX_AGE,
    path: `/customer-select/result/${projectId}`,
  });
  return response;
}
