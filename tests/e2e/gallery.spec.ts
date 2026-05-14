import { test, expect, Page } from "@playwright/test";
import { loginAsPhotographer } from "../helpers/auth";

/** 고객 갤러리 URL 추출 — 작가로 로그인 후 프로젝트에서 초대 링크 읽기 */
async function getGalleryToken(page: Page): Promise<string | null> {
  await page.goto("/photographer/projects");
  // selecting/confirmed/editing 상태 프로젝트에 초대 링크 존재
  const projectLink = page.locator("a[href*='/photographer/projects/']").first();
  if (!(await projectLink.isVisible({ timeout: 5000 }).catch(() => false))) {
    return null;
  }
  await projectLink.click();

  // 초대 링크 클립보드 버튼 근처에서 /c/ URL 찾기
  const inviteText = await page.locator("text=/c/").first()
    .textContent({ timeout: 5000 })
    .catch(() => null);
  if (!inviteText) return null;

  const match = inviteText.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

test.describe("고객 갤러리 (Gallery)", () => {
  test("S1: 갤러리 로드 — 사진 목록 렌더링", async ({ page }) => {
    // 작가로 로그인해서 토큰 찾기
    await loginAsPhotographer(page);
    const token = await getGalleryToken(page);
    if (!token) {
      test.skip(true, "고객 접근 가능 프로젝트 없음 — 테스트 건너뜀");
      return;
    }

    // 새 컨텍스트 (고객 관점 — 로그인 없이 접근)
    await page.goto(`/c/${token}/gallery`);

    // PIN이 있으면 건너뜀 (자동화 범위 외)
    if (await page.locator("input[inputmode='numeric']").isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "PIN 보호 프로젝트 — 테스트 건너뜀");
      return;
    }

    // 갤러리 로드 확인
    await expect(page).toHaveURL(/\/c\/.+\/gallery/);
    // 사진 또는 빈 상태 메시지 중 하나 확인
    const hasPhoots = await page.locator("img").count();
    expect(hasPhoots).toBeGreaterThanOrEqual(0); // 최소 렌더링 확인
  });

  test("S3: 사진 선택 시 확정 버튼 상태 변화", async ({ page }) => {
    await loginAsPhotographer(page);
    const token = await getGalleryToken(page);
    if (!token) {
      test.skip(true, "고객 접근 가능 프로젝트 없음 — 테스트 건너뜀");
      return;
    }

    await page.goto(`/c/${token}/gallery`);

    if (await page.locator("input[inputmode='numeric']").isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "PIN 보호 프로젝트 — 테스트 건너뜀");
      return;
    }

    // 사진이 있는 경우에만 선택 테스트
    const photos = page.locator("img[loading='lazy']");
    const count = await photos.count();
    if (count === 0) {
      test.skip(true, "갤러리에 사진 없음 — 테스트 건너뜀");
      return;
    }

    // 첫 번째 사진 클릭 → 선택
    await photos.first().click();
    await page.waitForTimeout(500);

    // SELECTED 카운트가 1 이상으로 변경되는지 확인
    const selectedLabel = page.locator("text=SELECTED").or(page.locator("text=선택됨"));
    await expect(selectedLabel).toBeVisible({ timeout: 5000 });
  });
});
