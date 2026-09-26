import { createHmac, timingSafeEqual } from "node:crypto";

export const CUSTOMER_RESULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function customerResultCookieName(projectId: string): string {
  return `customer_result_${projectId}`;
}

export function signCustomerResultToken(projectId: string): string {
  const secret = process.env.PIN_COOKIE_SECRET;
  if (!secret) throw new Error("PIN_COOKIE_SECRET is not set");
  return createHmac("sha256", secret).update(`customer-result:${projectId}`).digest("base64url");
}

export function verifyCustomerResultToken(projectId: string, token: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = Buffer.from(signCustomerResultToken(projectId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
