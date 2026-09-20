export const CUSTOMER_SHARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function customerShareCookieName(projectId: string): string {
  return `customer_share_${projectId}`;
}

export function customerProjectIdFromPath(pathname: string): string | null {
  return pathname.match(/^\/customer-select\/([^/]+)(?:\/|$)/)?.[1] ?? null;
}
