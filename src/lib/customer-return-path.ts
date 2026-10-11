/** PIN 인증 이후에는 현재 고객 링크 안으로만 돌아간다. */
export function customerReturnPath(token: string, value: unknown): string {
  const base = `/c/${encodeURIComponent(token)}`;
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) return base;
  try {
    const url = new URL(value, "https://customer.invalid");
    if (url.origin !== "https://customer.invalid") return base;
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return base;
    if (url.pathname === `${base}/pin`) return base;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return base;
  }
}
