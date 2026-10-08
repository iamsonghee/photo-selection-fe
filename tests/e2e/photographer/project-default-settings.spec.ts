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
      defaultSelectionDeadlineDays: null,
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
  const deadlineInput = page.getByLabel("셀렉 기본 마감 기간");
  await expect(deadlineInput).toHaveValue("");
  await expect(deadlineInput).toHaveCSS("height", "44px");
  await expect(page.getByRole("radio", { name: /원본 준비 후 셀렉 시작/ })).toHaveAttribute("aria-checked", "true");

  // 바꾼 내용이 없으면 저장은 꺼져 있다(설정 화면에 주황 저장 버튼이 둘 다 켜지지 않게).
  const saveDefaults = page.getByRole("button", { name: "기본 설정 저장" });
  await expect(saveDefaults).toBeDisabled();
  await page.getByRole("radio", { name: /미리보기 준비 후 셀렉 시작/ }).click();
  await saveDefaults.click();

  await expect.poll(() => saved).toEqual({
    default_selection_deadline_days: null,
    default_include_original: false,
    default_upload_strategy: "preview_first",
  });
  await expect(page.getByText("프로젝트 기본 설정이 저장되었습니다.")).toBeVisible();
});
