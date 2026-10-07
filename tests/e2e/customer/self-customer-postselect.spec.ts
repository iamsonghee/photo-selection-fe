import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}: finish, retry, share and return to comparison`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const id = "postselect-flow";
    const image = "/landing/sample-project/studio-v2/originals/ACUT_0001.jpg";
    const photo = { id: "p1", projectId: id, orderIndex: 0, url: image, previewUrl: image, originalFilename: "ACUT_0001.jpg" };
    const project = { id, name: "가족 촬영", shootType: "family", target: 1, photoCount: 1, uploaded: true, photos: [photo], selectedIds: [photo.id], photoStates: {}, participantOpinions: {}, participantDone: { red: false }, participantNicknames: { red: "소유자" }, onlineParticipants: [], participantViews: {}, realtimeKey: "", exported: false, deliveryCount: 0, shareToken: "", shareEnabled: false, selectionCompletedAt: null as string | null };
    let failCompletion = true;
    let hasRetouch = false;
    let completions = 0;
    await page.route(`**/api/customer-select/projects/${id}**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/complete-selection")) {
        completions++;
        if (failCompletion) return route.fulfill({ status: 500, json: { error: "셀렉 완료 상태를 저장하지 못했어요. 다시 시도해 주세요." } });
        project.selectionCompletedAt = "2026-10-07T00:00:00Z";
        return route.fulfill({ json: { selectionCompletedAt: project.selectionCompletedAt } });
      }
      if (path.endsWith("/sync")) return route.fulfill({ json: project });
      if (path.endsWith("/result-link")) return route.fulfill({ json: { url: `/customer-select/result/${id}` } });
      if (path.endsWith("/retouch")) return route.fulfill({ json: { isOwner: true, retouchDone: false, photos: [{ ...photo, filename: photo.originalFilename, versions: hasRetouch ? [{ id: "v1", round: 1, filename: "ACUT_0001_edit.jpg", thumbUrl: image, previewUrl: image }] : [] }] } });
      if (path.endsWith(id)) return route.fulfill({ json: { project, isOwner: true } });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/customer-select/${id}/select`);
    const finish = page.getByRole("button", { name: "선택 결과 확인하기 →" });
    await expect(finish).toBeVisible();
    await finish.click();
    await expect(page.getByRole("alert").filter({ hasText: "셀렉 완료 상태를 저장하지 못했어요" })).toBeVisible();
    await expect(page).toHaveURL(/\/select$/);
    failCompletion = false;
    await finish.click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole("heading", { name: "1장을 골랐어요" })).toBeVisible();
    await expect(page.getByText(/셀렉 결과가 저장됐어요/)).toBeVisible();
    await expect(page.getByRole("button", { name: "받은 보정본 올리기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "파일명만 TXT" })).not.toBeVisible();
    await page.getByText("다른 전달 방식", { exact: true }).click();
    await expect(page.getByRole("button", { name: "파일명만 TXT" })).toBeVisible();
    await page.getByRole("button", { name: "링크 복사", exact: true }).click();
    await expect(page.getByRole("button", { name: "링크를 복사했어요" })).toBeVisible();
    expect(project.exported).toBe(false);
    expect(project.deliveryCount).toBe(0);
    expect(completions).toBe(2);
    await page.screenshot({ path: testInfo.outputPath("result.png"), fullPage: true });
    hasRetouch = true;
    await page.reload();
    await page.getByRole("button", { name: "보정본 1장 비교하기" }).click();
    await expect(page).toHaveURL(/\/retouch\/compare$/);
    await expect(page.getByRole("button", { name: "ACUT_0001.jpg 보정본 비교하기" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("compare.png"), fullPage: true });
    await page.getByRole("button", { name: "셀렉 결과로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/review$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
