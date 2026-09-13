import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import {
  createEditingProject,
  deleteTestProject,
  setProjectStatus,
} from "../../helpers/setup";

test("납품 완료 최종본은 과거 재보정 요청 상태를 노출하지 않는다", async ({ page }) => {
  await loginAsPhotographer(page);
  const project = await createEditingProject(page, 1);

  try {
    const photosResponse = await page.request.get(
      `/api/photographer/projects/${project.projectId}/photos`,
    );
    const photosPayload = await photosResponse.json();
    const photo = photosPayload.photos[0];
    const imageUrl = photo.r2_thumb_url as string;

    await page.route(
      `**/api/photographer/projects/${project.projectId}/versions*`,
      (route) => route.fulfill({
        json: {
          project_status: "delivered",
          version_history: [],
          versions: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              photo_id: photo.id,
              version: 1,
              r2_url: imageUrl,
              r2_thumb_url: imageUrl,
              review_status: "revision_requested",
              customer_comment: "이전 재보정 요청",
              version_filename: "1차보정.jpg",
              created_at: "2026-09-01T00:00:00Z",
              reviewed_at: "2026-09-01T01:00:00Z",
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              photo_id: photo.id,
              version: 2,
              r2_url: imageUrl,
              r2_thumb_url: imageUrl,
              review_status: "approved",
              customer_comment: null,
              version_filename: "최종보정.jpg",
              created_at: "2026-09-02T00:00:00Z",
              reviewed_at: "2026-09-02T01:00:00Z",
            },
          ],
        },
      }),
    );
    await setProjectStatus(page, project.projectId, "delivered");

    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto(`/photographer/projects/${project.projectId}/assets/final`);

    await expect(page.getByRole("tab", { name: "최종본", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("region", { name: "최종본 작업 도구" })).toContainText(
      "최종 확정본",
    );
    await expect(page.getByText("재보정 요청", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('[data-final-photo-header] p[title="최종보정.jpg"]')).toBeVisible();
    await page.getByRole("button", { name: "최종본 내보내기", exact: true }).click();
    const exportPopover = page.getByRole("dialog", { name: "최종본 내보내기" });
    await expect(exportPopover).toBeVisible();
    expect((await exportPopover.boundingBox())!.height).toBeLessThan(220);
    await expect(page.getByRole("button", { name: "최종본 내보내기 메뉴 닫기" })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.screenshot({ path: "/tmp/final-mobile-export-open.png" });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "내보내기", exact: true }).filter({ visible: true }).click();
    const desktopExportMenu = page.getByText("목록 내보내기", { exact: true });
    await expect(desktopExportMenu).toBeVisible();
    const csvExportButton = page.getByRole("button", { name: "파일명 목록 (.csv)", exact: true });
    await expect(csvExportButton).toBeVisible();
    await expect.poll(() => csvExportButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const elementAtCenter = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return elementAtCenter === button || button.contains(elementAtCenter);
    })).toBe(true);
  } finally {
    await deleteTestProject(page, project.projectId);
  }
});
