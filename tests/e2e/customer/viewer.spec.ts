import { test, expect } from "@playwright/test";
import { setupFullProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;

/* 다운로드 기한 표시는 D-day(오늘 기준 계산)와 만료 일시 두 가지다 — 만료일을 고정 날짜로 박으면
 * 작성한 날에만 통과하고 다음 날부터 매일 깨진다(실제로 `2026-10-13` + `D-30` 조합이 그렇게 썩었다).
 * 오늘 자정 + 30일로 만들어 D-30을 고정하고, 화면에 나올 문자열도 같은 값에서 뽑아 쓴다. */
const EXPIRES_IN_DAYS = 30;
const expiresAtDate = new Date(new Date().setHours(0, 0, 0, 0) + EXPIRES_IN_DAYS * 86_400_000);
const expiresAtIso = expiresAtDate.toISOString();
const expiresAtLabel = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul",
}).format(expiresAtDate);

test("V12: 완료 화면의 라이트 테마와 다운로드 준비·만료 상태", async ({ page }) => {
  await page.route("**/api/c/photos?*", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, project: { ...data.project, status: "delivered", includeOriginal: false, deliveredAt: "2026-09-13T03:00:00Z" } } });
  });
  let expired = false;
  await page.route("**/api/c/final-delivery?*", route => route.fulfill({ json: {
    visible: true, expired, preparing: false, failed: false, fileCount: 6, totalBytes: 5242880,
    expiresAt: expiresAtIso, files: [{ partNumber: 1, fileCount: 6, byteSize: 5242880 }],
    previewFiles: [
      { photoId: "final-1", filename: "final-1.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0001.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0001.jpg" },
      { photoId: "final-2", filename: "final-2.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0006.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0006.jpg" },
      { photoId: "final-3", filename: "final-3.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0010.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0010.jpg" },
      { photoId: "final-4", filename: "final-4.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0013.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0013.jpg" },
      { photoId: "final-5", filename: "final-5.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0001.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0001.jpg" },
      { photoId: "final-6", filename: "final-6.jpg", url: "/landing/sample-project/studio-v2/retouched/ACUT_0006.jpg", thumbnailUrl: "/landing/sample-project/studio-v2/retouched/ACUT_0006.jpg" },
    ],
  } }));
  let archiveRequested = false;
  await page.route("**/api/c/final-delivery/archive?*", route => {
    archiveRequested = true;
    return route.fulfill({ json: { files: [{ partNumber: 1, fileCount: 6, byteSize: 5242880, url: "#download" }] } });
  });
  await page.goto(`${project.galleryUrl.replace(/\/gallery$/, "")}/delivered`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("[E2E]");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByLabel("최종 보정본 다운로드 정보")).toContainText("6장");
  await expect(page.getByLabel("최종 보정본 다운로드 정보")).toContainText(expiresAtLabel);
  await expect(page.getByLabel("최종 보정본 미리보기").getByRole("button", { name: /크게 보기/ })).toHaveCount(5);
  await expect(page.getByLabel("최종 보정본 미리보기").locator("small:visible").filter({ hasText: "더보기" })).toHaveCount(1);
  await expect(page.getByLabel("최종 보정본 다운로드 정보").getByText(`D-${EXPIRES_IN_DAYS}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.screenshot({ path: "test-results/delivery-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "final-1.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "final-1.jpg 상세 보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이전 사진" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("수령 완료일", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "최종 보정본 다운로드", exact: true }).click();
  await expect.poll(() => archiveRequested).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expired = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel("최종 보정본 다운로드 정보")).toContainText("다운로드 기간이 만료");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByLabel("사진 보관 안내")).toBeVisible();
  await page.screenshot({ path: "test-results/delivery-mobile.png", fullPage: true });
  await expect(page.getByText("수령 완료일", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
});

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 5);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

async function openGallery(page: import("@playwright/test").Page) {
  await page.goto(project.galleryUrl);
  await page.waitForLoadState("networkidle");
}

test.describe("고객 — 뷰어 (사진 크게 보기)", () => {
  test("V1: 갤러리 사진 클릭 → 뷰어 진입", async ({ page }) => {
    await openGallery(page);
    // 뷰어 링크 찾기
    const viewerLinks = page.locator("a[href*='/viewer/']");
    const count = await viewerLinks.count();
    if (count === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/viewer\//);
    // 사진 이미지 확인
    await expect(page.locator("img").first()).toBeVisible({ timeout: 8000 });
  });

  test("V1-FOCUS: 셀렉 상세의 이동 버튼은 집중 보기에서만 사라진다", async ({ page }) => {
    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);

    const desktopStage = page.locator(".fs-stage-row");
    await expect(desktopStage.getByRole("button", { name: "이전 사진" })).toBeVisible();
    await expect(desktopStage.getByRole("button", { name: "다음 사진" })).toBeVisible();
    await desktopStage.locator("img").first().click();
    const focusOverlay = page.locator(".pfo-root");
    await expect(focusOverlay).toBeVisible();
    await expect(focusOverlay.getByRole("button", { name: /사진/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileStage = page.locator(".fv-image-stage");
    await expect(mobileStage.getByRole("button", { name: "다음 사진" })).toBeVisible();
  });

  test("V2: 뷰어에서 방향키(→) → 다음 사진으로 이동", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    const urlBefore = page.url();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    // URL 변경 또는 카운터 변경 확인
    const urlAfter = page.url();
    const counterChanged = await page.locator("text=2 /").or(page.locator("text=/ 5")).isVisible({ timeout: 3000 }).catch(() => false);
    expect(urlAfter !== urlBefore || counterChanged).toBeTruthy();
  });

  test("V3: 뷰어에서 ESC → 갤러리 복귀", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/gallery/, { timeout: 3000 });
  });

  test("V4: 뷰어에서 사진 선택/해제 (Space 키)", async ({ page }) => {
    await openGallery(page);
    const viewerLinks = page.locator("a[href*='/viewer/']");
    if (await viewerLinks.count() === 0) { test.skip(true, "뷰어 링크 없음"); return; }
    const href = await viewerLinks.first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    // Space 키로 선택
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    // Space 키로 해제
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    // 뷰어 URL 유지 확인
    await expect(page).toHaveURL(/\/viewer\//);
  });

  test("V9: PC 셀렉 상세에서 단축키 안내를 열고 Escape로 도움말만 닫음", async ({ page }) => {
    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /전체 단축키/ }).click();
    const dialog = page.getByRole("dialog", { name: "단축키" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("사진 선택 · 선택 해제");
    await expect(dialog).toContainText("별점 설정");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/viewer\//);
  });

  test("V5: 존재하지 않는 사진 주소 → 안내와 갤러리 복귀 링크", async ({ page }) => {
    await page.goto(`${project.galleryUrl.replace(/\/gallery$/, "")}/viewer/not-a-real-photo-id`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "사진을 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByRole("link", { name: "갤러리로 돌아가기" })).toHaveAttribute("href", /\/gallery/);
  });

  test("V6: 현재·인접 프리뷰를 배치 발급하고 캐시된 사진은 다시 요청하지 않음", async ({ page }) => {
    const requestedBatches: string[][] = [];
    const transparentGif = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    await page.route("**/api/c/presign-preview?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const photoIds = (requestUrl.searchParams.get("photoIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      requestedBatches.push(photoIds);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presignedUrls: Object.fromEntries(photoIds.map((id) => [
            id,
            { url: `${transparentGif}#${id}`, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
          ])),
        }),
      });
    });

    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);

    await expect.poll(() => requestedBatches.length).toBe(1);
    expect(requestedBatches[0]).toHaveLength(3); // 첫 사진 + 다음 2장

    await page.keyboard.press("ArrowRight");
    await expect.poll(() => requestedBatches.length).toBe(2);
    expect(requestedBatches[1]).toHaveLength(1); // 앞서 받은 3장은 캐시, 새 다음 사진만 추가

    const allRequestedIds = requestedBatches.flat();
    expect(new Set(allRequestedIds).size).toBe(allRequestedIds.length);
    expect(requestedBatches.every((batch) => batch.length <= 4)).toBeTruthy();
  });

  test("V7: 모바일은 현재 사진과 양옆 1장 범위만 선발급", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requestedBatches: string[][] = [];
    await page.route("**/api/c/presign-preview?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const photoIds = (requestUrl.searchParams.get("photoIds") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      requestedBatches.push(photoIds);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          presignedUrls: Object.fromEntries(photoIds.map((id) => [
            id,
            {
              url: `data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=#${id}`,
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
            },
          ])),
        }),
      });
    });

    await openGallery(page);
    const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
    if (!href) { test.skip(true, "뷰어 URL 없음"); return; }
    await page.goto(href);

    await expect.poll(() => requestedBatches.length).toBe(1);
    expect(requestedBatches[0]).toHaveLength(2); // 첫 사진 + 다음 1장 (이전 사진 없음)
  });

  test("V8: 보정본 상세는 다크 셸·사진 집중 보기·모바일 길게 누르기를 유지", async ({ page }) => {
    test.setTimeout(60_000);
    const svg = (label: string, color: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="${color}"/><text x="450" y="600" text-anchor="middle" fill="white" font-size="64">${label}</text></svg>`)}`;
    const versionUrl = svg("RETOUCHED", "#815742");
    const originalUrl = svg("ORIGINAL", "#536b78");

    await page.route("**/api/c/photos?*", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({
        response,
        json: {
          ...data,
          project: {
            ...data.project,
            status: "reviewing_v1",
            maxRevisionCount: 2,
            revisionRound: 0,
          },
        },
      });
    });
    await page.route("**/api/c/review?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        photos: [{
          id: "visual-review-photo",
          photoVersionId: "visual-version",
          originalFilename: "ACUT_0010.jpg",
          originalUrl,
          versionUrl,
          versionThumbUrl: versionUrl,
          orderIndex: 1,
        }],
      }),
    }));
    await page.route("**/api/c/review/draft?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ drafts: {} }),
    }));

    await page.goto(`${project.galleryUrl.replace(/\/gallery$/, "")}/review/visual-review-photo`);
    const root = page.locator(".rvx-root");
    const frame = page.locator(".rvx-frame");
    const images = frame.locator("img");
    await expect(root).toHaveCSS("background-color", "rgb(15, 17, 19)");
    await expect(images).toHaveCount(2);
    /* 원본 비율 밖으로 보정본이 비치지 않도록 비교 레이어가 사진 프레임 전체를 검게 덮는다. */
    await expect(images.nth(1)).toHaveCSS("background-color", "rgb(15, 17, 19)");
    const [frameBox, originalBox] = await Promise.all([frame.boundingBox(), images.nth(1).boundingBox()]);
    expect(originalBox?.width).toBeCloseTo(frameBox?.width ?? 0, 0);
    expect(originalBox?.height).toBeCloseTo(frameBox?.height ?? 0, 0);
    await expect(frame.locator(".rvx-frame-tags")).toHaveCount(0);
    await expect(page.locator(".rvx-panel-status")).toContainText("아직 검토하지 않았어요");
    await expect(page.locator(".rvx-completion")).toContainText("0 / 1장 검토");
    const stripHeightBefore = (await page.locator(".rvx-strip").boundingBox())?.height;
    await expect(page.getByRole("button", { name: "확정", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "확정", exact: true }).click();
    await expect(page.locator(".rvx-panel-status")).toContainText("확정했어요");
    await expect(page.locator(".rvx-completion")).toContainText("1장 모두 확인했어요");
    await expect(page.getByRole("button", { name: "작가에게 전달" })).toBeVisible();
    expect((await page.locator(".rvx-strip").boundingBox())?.height).toBe(stripHeightBefore);
    const panelBox = await page.locator(".rvx-panel").boundingBox();
    const completionBox = await page.locator(".rvx-completion").boundingBox();
    const copyBox = await page.locator(".rvx-completion-copy").boundingBox();
    const submitBox = await page.locator(".rvx-completion-action").boundingBox();
    expect(completionBox!.x).toBe(panelBox!.x);
    expect(completionBox!.width).toBe(panelBox!.width);
    expect(submitBox!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height);
    await expect(root.locator(".ac-confirm-footer")).toHaveCount(0);
    await expect(root.locator(".rvx-arrows").getByRole("button", { name: /사진/ })).toHaveCount(2);
    await expect(root.locator(".rvx-arrows").getByRole("button", { name: /사진/ }).first()).toBeVisible();

    await images.first().click();
    const focusOverlay = page.locator(".pfo-root");
    const focusImages = focusOverlay.locator("img");
    await expect(focusOverlay).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(focusOverlay.locator("button")).toHaveCount(0);
    await expect(focusImages).toHaveCount(2);
    await page.keyboard.down("Backslash");
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "1");
    await page.keyboard.up("Backslash");
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "0");
    await expect(focusOverlay).toBeVisible();
    const focusBox = await focusOverlay.boundingBox();
    expect(focusBox).toBeTruthy();
    await page.mouse.move(focusBox!.x + focusBox!.width / 2, focusBox!.y + focusBox!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "1");
    await page.mouse.up();
    await expect(focusOverlay).toBeVisible();
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "0");

    /* 고객 집중 확대에서는 길게 누른 뒤 손을 떼도 상세 화면으로 닫히지 않는다. */
    await page.setViewportSize({ width: 390, height: 844 });
    await focusOverlay.dispatchEvent("touchstart", {
      touches: [{ identifier: 2, clientX: 190, clientY: 300 }],
      changedTouches: [{ identifier: 2, clientX: 190, clientY: 300 }],
    });
    await focusOverlay.dispatchEvent("pointerdown", {
      pointerType: "touch", isPrimary: true, button: 0, pointerId: 2, clientX: 190, clientY: 300,
    });
    await page.waitForTimeout(350);
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "1");
    await focusOverlay.dispatchEvent("touchend", {
      touches: [],
      changedTouches: [{ identifier: 2, clientX: 190, clientY: 300 }],
    });
    await focusOverlay.dispatchEvent("click");
    await page.waitForTimeout(350);
    await expect(focusOverlay).toBeVisible();
    await expect(focusImages.nth(1)).toHaveCSS("opacity", "0");
    await page.keyboard.press("Escape");

    await expect(page.getByRole("button", { name: /원본/ })).toBeHidden();
    await expect(root.locator(".rvx-arrows").getByRole("button", { name: /사진/ }).first()).toBeVisible();
    await expect(page.getByText("사진을 꾹 누르면 원본을 볼 수 있어요.")).toBeVisible();
    await images.first().dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, button: 0, clientX: 190, clientY: 300 });
    await page.waitForTimeout(350);
    await expect(images.nth(1)).toHaveCSS("opacity", "1");
    await images.first().dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, button: 0, clientX: 190, clientY: 300 });
    await expect(images.nth(1)).toHaveCSS("opacity", "0");
    /* 길게 누르는 동안 리렌더돼도 시작 좌표를 잃어 다음 사진 스와이프로 오판하지 않는다. */
    const heldPhotoUrl = page.url();
    await images.first().dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 190, clientY: 300 }],
      changedTouches: [{ identifier: 1, clientX: 190, clientY: 300 }],
    });
    await images.first().dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, button: 0, clientX: 190, clientY: 300 });
    await page.waitForTimeout(350);
    await expect(images.nth(1)).toHaveCSS("opacity", "1");
    await images.first().dispatchEvent("touchend", {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 190, clientY: 300 }],
    });
    await expect(images.nth(1)).toHaveCSS("opacity", "0");
    await expect(page).toHaveURL(heldPhotoUrl);

  });
});


test("V10: 최종 보정본 상세에서 전체 수령 확인 및 실패 후 재시도", async ({ page }) => {
  await page.route("**/api/c/photos?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, project: { ...data.project, status: "reviewing_v2", maxRevisionCount: 1, revisionRound: 1 } } });
  });
  await page.route("**/api/c/review?*", route => route.fulfill({ json: { photos: [
    { id: "receipt-photo", photoVersionId: "receipt-version", originalFilename: "final.jpg", versionUrl: "/favicon.ico", orderIndex: 1 },
    { id: "receipt-photo-2", photoVersionId: "receipt-version-2", originalFilename: "final2.jpg", versionUrl: "/favicon.ico", orderIndex: 2 },
  ] } }));
  await page.route("**/api/c/review/draft?*", route => route.fulfill({ json: { drafts: {} } }));
  let attempts = 0;
  await page.route("**/api/c/review/submit", async route => {
    attempts++;
    expect(route.request().postDataJSON().reviews).toEqual([
      { photo_version_id: "receipt-version", photo_id: "receipt-photo", status: "approved", customer_comment: null },
      { photo_version_id: "receipt-version-2", photo_id: "receipt-photo-2", status: "approved", customer_comment: null },
    ]);
    await route.fulfill({ status: attempts === 1 ? 500 : 200, json: attempts === 1 ? { error: "잠시 후 다시 시도해 주세요" } : { status: "delivered" } });
  });
  const base = project.galleryUrl.replace(/\/gallery$/, "");
  await page.route("**/delivered", route => route.fulfill({ contentType: "text/html", body: "수령 완료" }));
  await page.goto(`${base}/review/receipt-photo`);
  await expect(page.locator(".rvx-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "수령 완료", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "수령 완료", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("보정본 2장을 수령");
  expect(attempts).toBe(0);
  await dialog.getByRole("button", { name: "수령 완료", exact: true }).click();
  await expect(dialog).toContainText("잠시 후 다시 시도해 주세요");
  await dialog.getByRole("button", { name: "수령 완료", exact: true }).click();
  await expect(page).toHaveURL(/\/delivered$/);
  expect(attempts).toBe(2);
});

test("V13: 보정본 확정 후 현재 사진에 머문다", async ({ page }) => {
  await page.route("**/api/c/photos?*", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, project: { ...data.project, status: "reviewing_v1", maxRevisionCount: 2, revisionRound: 0 } } });
  });
  await page.route("**/api/c/review?*", route => route.fulfill({ json: { photos: [
    { id: "stay-photo-1", photoVersionId: "stay-version-1", originalFilename: "stay-1.jpg", versionUrl: "/favicon.ico", orderIndex: 1 },
    { id: "stay-photo-2", photoVersionId: "stay-version-2", originalFilename: "stay-2.jpg", versionUrl: "/favicon.ico", orderIndex: 2 },
  ] } }));
  await page.route("**/api/c/review/draft?*", route => route.fulfill({ json: { drafts: {} } }));

  const url = `${project.galleryUrl.replace(/\/gallery$/, "")}/review/stay-photo-1`;
  await page.goto(url);
  await page.getByRole("button", { name: "확정", exact: true }).click();
  await page.waitForTimeout(300);

  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: "확정됨", exact: true })).toBeVisible();
  await expect(page.locator(".rvx-sum-approved")).toContainText("1");
});


test("V11: 셀렉 상세는 PC와 모바일에서 고정된 확정 동작을 제공", async ({ page }) => {
  await page.route("**/api/c/photos?*", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, project: { ...data.project, requiredCount: 1 } } });
  });
  await openGallery(page);
  const href = await page.locator("a[href*='/viewer/']").first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  const desktop = page.locator(".fs-selection-strip");
  await expect(desktop.getByRole("button", { name: "셀렉 확정하기" })).toBeDisabled();
  const before = await desktop.boundingBox();
  await page.keyboard.press("Space");
  await expect(desktop.getByRole("button", { name: "셀렉 확정하기" })).toBeEnabled();
  expect((await desktop.boundingBox())!.height).toBe(before!.height);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileButton = page.locator(".fv-mobile").getByRole("button", { name: "셀렉 확정하기" });
  await expect(mobileButton).toBeInViewport();
  await mobileButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
