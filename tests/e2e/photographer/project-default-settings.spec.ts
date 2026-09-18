import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("작가 프로젝트 기본값을 불러오고 저장한다", async ({ page }) => {
  await loginAsPhotographer(page);
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/photographer/profile", async (route) => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {
      id: "settings-test",
      authId: "settings-test",
      email: "settings@example.test",
      name: "테스트 작가",
      profileImageUrl: null,
      bio: null,
      instagramUrl: null,
      portfolioUrl: null,
      contactPhone: null,
      defaultSelectionDeadlineDays: 30,
      defaultIncludeOriginal: false,
      defaultUploadStrategy: "parallel",
      createdAt: "2026-09-18T00:00:00Z",
    } });
  });

  await page.goto("/photographer/settings");
  await expect(page.locator("[data-default-profile-image]")).toHaveAttribute("src", "/images/default-profile-v2.png");
  const contactInfo = page.getByRole("button", { name: "연락처 설명" });
  await contactInfo.hover();
  await expect(page.getByRole("tooltip")).toHaveText("알림 연동 시 사용됩니다.");
  const deadlineInput = page.getByLabel("셀렉 마감 기본 기간");
  await expect(deadlineInput).toHaveValue("30");
  await expect(deadlineInput).toHaveCSS("height", "44px");
  await expect(page.getByRole("radio", { name: /원본까지 준비 후 요청/ })).toHaveAttribute("aria-checked", "true");

  await deadlineInput.fill("45");
  await page.getByLabel("새 프로젝트 원본 다운로드 허용").click();
  await page.getByRole("radio", { name: /빠른 셀렉 요청/ }).click();
  await page.getByRole("button", { name: "기본 설정 저장" }).click();

  await expect.poll(() => saved).toEqual({
    default_selection_deadline_days: 45,
    default_include_original: true,
    default_upload_strategy: "preview_first",
  });
  await expect(page.getByText("프로젝트 기본 설정이 저장되었습니다.")).toBeVisible();
});
