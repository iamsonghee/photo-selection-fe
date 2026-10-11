export const CUSTOMER_SHARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function customerShareCookieName(projectId: string): string {
  return `customer_share_${projectId}`;
}

export function customerProjectIdFromPath(pathname: string): string | null {
  const id = pathname.match(/^\/select\/([^/]+)(?:\/|$)/)?.[1];
  return id && !["projects", "new", "guest", "login"].includes(id) ? id : null;
}
