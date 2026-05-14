import type { Page } from "@playwright/test";

/** 작가 로그인 후 preparing 상태 프로젝트 ID 반환 (없으면 null) */
export async function findPreparingProjectId(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  // URL에 프로젝트 ID가 포함된 upload 링크 탐색
  const links = await page.locator("a[href*='/upload']").all();
  for (const link of links) {
    const href = await link.getAttribute("href");
    const match = href?.match(/\/projects\/([a-f0-9-]{36})\/upload/);
    if (match) return match[1];
  }
  return null;
}

/** 작가 로그인 후 고객 접근 가능한 초대 토큰 반환 (없으면 null) */
export async function findActiveProjectToken(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  // 프로젝트 상세 페이지를 순회하며 accessToken 탐색
  const projectLinks = await page.locator("a[href*='/photographer/projects/']").all();
  for (const link of projectLinks.slice(0, 5)) {
    const href = await link.getAttribute("href");
    if (!href || href.includes("/upload") || href.includes("/workflow")) continue;
    const idMatch = href.match(/\/projects\/([a-f0-9-]{36})/);
    if (!idMatch) continue;
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    // 초대 링크 텍스트에서 토큰 추출
    const pageContent = await page.content();
    const tokenMatch = pageContent.match(/\/c\/([a-f0-9-]{36})/);
    if (tokenMatch) return tokenMatch[1];
  }
  return null;
}

/** 첫 번째 프로젝트의 상세 URL 반환 */
export async function findFirstProjectUrl(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  await page.waitForLoadState("networkidle");
  const link = page.locator("a[href*='/photographer/projects/']").first();
  if (!(await link.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  return link.getAttribute("href");
}
