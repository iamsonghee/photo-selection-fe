import { chromium, webkit, expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createEditingProject, deleteTestProject, setProjectStatus } from "../../helpers/setup";

for (const browserName of ["chromium", "webkit"] as const) {
    test(`${browserName}: project-list entry, return navigation and partial upload fit mobile`, async () => {
      test.setTimeout(60_000);
      const browser = await ({ chromium, webkit })[browserName].launch();
      const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      await loginAsPhotographer(page);
      const project = await createEditingProject(page, 20);
      try {
        const response = await page.request.get(`/api/photographer/projects/${project.projectId}/photos`);
        const payload = await response.json();
        const photoId = payload.photos[0].id;
        const retouchedFilename = "보정본_파일명이_길어도_전체_이름을_확인할_수_있는_사진.jpg";
        const selectionComment = "셀렉 때 남긴 요청:\n얼굴 밝기를 조정해주세요.\n피부 질감을 유지해주세요.\n배경도 확인해주세요.\n자연스럽게 부탁드립니다.";
        const retouchComment = "보정 확인 요청: 피부 질감을 유지해주세요.\n" + "배경과 얼굴의 밝기를 함께 확인해주세요. ".repeat(3);
        const versionFullUrl = payload.photos[0].r2_thumb_url as string;
        const versionThumbUrl = `${versionFullUrl}${versionFullUrl.includes("?") ? "&" : "?"}card_thumb=1`;
        await page.route("**/rest/v1/selections?**", async (route) => {
          if (new URL(route.request().url()).searchParams.get("project_id") !== `eq.${project.projectId}`) return route.continue();
          const response = await route.fetch();
          const selections = await response.json();
          await route.fulfill({ response, json: selections.map((row: { photo_id: string }) => row.photo_id === photoId ? { ...row, comment: selectionComment } : row) });
        });
        let hasExistingVersion = false;
        let reviewStatus: "approved" | "revision_requested" | null = null;
        let hasReviewComment = true;
        let fixtureStatus = "editing";
        let hasSecondVersion = false;
        await page.route(`**/api/photographer/projects/${project.projectId}/versions*`, (route) => route.fulfill({ json: {
          project_status: fixtureStatus, version_history: [], versions: hasExistingVersion ? [{
            id: "11111111-1111-4111-8111-111111111111", photo_id: photoId, version: 1,
            r2_url: versionFullUrl,
            r2_thumb_url: versionThumbUrl, review_status: reviewStatus, customer_comment: hasReviewComment ? retouchComment : null,
            version_filename: retouchedFilename, created_at: "2026-09-09T00:00:00Z", reviewed_at: null,
          }, ...(hasSecondVersion ? [{
            id: "22222222-2222-4222-8222-222222222222", photo_id: photoId, version: 2,
            r2_url: versionFullUrl, r2_thumb_url: versionThumbUrl,
            review_status: null, customer_comment: null, version_filename: "재보정.jpg",
            created_at: "2026-09-10T00:00:00Z", reviewed_at: null,
          }] : [])] : [],
        } }));
        await page.route("**/rest/v1/projects?**", async (route) => {
          if (!new URL(route.request().url()).searchParams.has("photographer_id")) return route.continue();
          const response = await route.fetch();
          const rows = await response.json();
          const target = rows.find((row: { id: string }) => row.id === project.projectId);
          if (!target) throw new Error("Fixture project missing from list");
          await route.fulfill({ response, json: [
            ...Array.from({ length: 8 }, (_, index) => ({ ...target, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `앞쪽 프로젝트 ${index}` })),
            { ...target, name: "탭 진입 검증 프로젝트" },
          ] });
        });
        let releasePhotos!: () => void;
        let photosRequested!: () => void;
        const photosGate = new Promise<void>((resolve) => { releasePhotos = resolve; });
        const photosStarted = new Promise<void>((resolve) => { photosRequested = resolve; });
        await page.route("**/rest/v1/photos?**", async (route) => {
          if (new URL(route.request().url()).searchParams.get("project_id") !== `eq.${project.projectId}`) return route.continue();
          photosRequested();
          await photosGate;
          await route.continue();
        });
        await page.goto("/photographer/projects");
        const targetCard = page.locator("[data-mobile-project-card]").filter({ hasText: "탭 진입 검증 프로젝트" });
        const uploadEntry = targetCard.getByRole("button", { name: "보정본 업로드", exact: true });
        await uploadEntry.scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
        const entryNavigation = uploadEntry.tap();
        await expect(page).toHaveURL(new RegExp(`${project.projectId}/assets/retouched`));
        try {
          await photosStarted;
          // The shell must already be stable while workspace data is still loading.
          await expect(page.locator(".photographer-mobile-header")).toHaveCSS("position", "fixed");
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        } finally { releasePhotos(); await entryNavigation; }
        const assertTabs = async () => {
          const header = page.locator(".photographer-mobile-header");
          const tabs = page.getByRole("tablist", { name: "프로젝트 사진 자산" });
          await expect(header).toBeVisible();
          await expect(tabs).toBeVisible();
          await expect.poll(async () => ((await header.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);
          const back = header.getByRole("link", { name: "프로젝트 상세로 돌아가기" });
          await expect.poll(() => back.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          })).toBe(true);
          await expect.poll(async () => ((await header.boundingBox())?.y ?? -Infinity)).toBeGreaterThanOrEqual(0);
          await expect.poll(async () => {
            const headerBox = await header.boundingBox();
            const tabsBox = await tabs.boundingBox();
            return headerBox && tabsBox ? tabsBox.y - headerBox.y - headerBox.height : -Infinity;
          }).toBeGreaterThanOrEqual(-1);
          for (const tab of await tabs.getByRole("tab").all()) {
            await expect.poll(() => tab.evaluate((element) => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
          }
        };
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).tap();
        await assertTabs();
        // Outer scroll attempts must never move the project header out of view.
        await page.evaluate(() => {
          window.scrollTo(0, 200);
          document.querySelector(".photographer-app")!.scrollTop = 200;
        });
        await assertTabs();
        await page.setViewportSize({ width: 402, height: 700 });
        await assertTabs();
        await page.setViewportSize({ width: 402, height: 874 });
        await assertTabs();
        await page.screenshot({ path: `/tmp/mobile-header-visible-${browserName}.png` });
        await page.goBack();
        await uploadEntry.scrollIntoViewIfNeeded();
        await uploadEntry.tap();
        await assertTabs();
        hasExistingVersion = true;
        await page.reload();
        await assertTabs();
        const assetGrid = page.locator('[data-workflow-asset-content] .assetGrid, [data-workflow-asset-content] [class*="assetGrid"]').filter({ visible: true });
        const workflowCards = page.locator('[data-workflow-asset-card]').filter({ visible: true });
        await expect(workflowCards.first()).toBeVisible();
        const firstCardBox = (await workflowCards.nth(0).boundingBox())!;
        const secondCardBox = (await workflowCards.nth(1).boundingBox())!;
        expect(Math.abs(firstCardBox.y - secondCardBox.y)).toBeLessThanOrEqual(1);
        expect(secondCardBox.x).toBeGreaterThan(firstCardBox.x + firstCardBox.width - 1);
        const retouchedGridCard = workflowCards.filter({ hasText: retouchedFilename });
        const retouchedCardFilename = retouchedGridCard.locator('[data-retouched-card-filename]').filter({ visible: true });
        await expect(retouchedCardFilename).toHaveCSS('font-size', '12px');
        await expect(retouchedCardFilename).toHaveCSS('font-weight', '500');
        const retouchedCardFilenameColor = await retouchedCardFilename.evaluate((element) => getComputedStyle(element).color);
        await expect(retouchedGridCard).not.toContainText(selectionComment);
        await expect(retouchedGridCard).not.toContainText(retouchComment);
        const mobileMedia = retouchedGridCard.locator('[data-mobile-retouched-media]');
        const originalPreview = retouchedGridCard.getByRole('button', { name: /원본 보기$/ });
        const retouchedPreview = mobileMedia.getByRole('img', { name: 'V1', exact: true });
        const retouchedPreviewFrame = retouchedPreview.locator('..');
        await expect(originalPreview).toBeVisible();
        const [originalPreviewBox, retouchedPreviewBox] = await Promise.all([originalPreview.boundingBox(), retouchedPreviewFrame.boundingBox()]);
        expect(originalPreviewBox!.y + originalPreviewBox!.height).toBeLessThanOrEqual(retouchedPreviewBox!.y + 1);
        expect(originalPreviewBox!.width).toBeLessThan(retouchedPreviewBox!.width / 2);
        await expect(retouchedPreview).toHaveAttribute('srcset', /400w, .*1500w/);
        await expect(workflowCards.getByText('미업로드', { exact: true }).filter({ visible: true })).toHaveCount(0);
        await expect(workflowCards.nth(1).locator('[title="E2E_TEST_002.jpg"]').filter({ visible: true })).toHaveCount(1);
        const gridSelectAll = page.getByRole('checkbox', { name: '현재 목록 보정본 전체 선택', exact: true });
        await expect(gridSelectAll).not.toBeChecked();
        const cardSelect = retouchedGridCard.getByRole('checkbox', { name: /보정본 선택$/ });
        await expect(cardSelect).toBeVisible();
        expect((await cardSelect.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await cardSelect.tap();
        const selectedCardSelect = retouchedGridCard.getByRole('checkbox', { name: /보정본 선택 해제$/ });
        await expect(selectedCardSelect).toBeChecked();
        await selectedCardSelect.tap();
        await expect(cardSelect).not.toBeChecked();
        await gridSelectAll.tap();
        await expect(gridSelectAll).toBeChecked();
        const gridSelectionActionBar = page.locator('[data-photographer-page-action-bar]');
        await expect(gridSelectionActionBar.getByText('1장 선택됨', { exact: true })).toBeVisible();
        const gridDelete = gridSelectionActionBar.getByRole('button', { name: '선택 삭제 1장', exact: true });
        await expect(gridDelete).toHaveAttribute('data-variant', 'primary');
        await expect(gridSelectionActionBar.getByRole('button', { name: '선택 해제', exact: true })).toHaveCount(0);
        await gridSelectAll.tap();
        await expect(gridSelectAll).not.toBeChecked();
        await page.screenshot({ path: `/tmp/mobile-retouched-card-grid-${browserName}.png` });
        await page.getByRole('button', { name: '목록으로 보기', exact: true }).tap();
        await expect(assetGrid).toBeHidden();
        const mappedRow = page.locator('[data-retouched-mapping-row="true"]').filter({ hasText: retouchedFilename });
        await expect(mappedRow.getByText("원본", { exact: true })).toHaveCount(0);
        await expect(mappedRow.getByText("업로드 완료", { exact: true })).toHaveCount(0);
        await expect(mappedRow.locator('[data-mobile-mapping-arrow]')).toBeVisible();
        const comments = mappedRow.locator('[data-mobile-retouched-comments]');
        await expect(comments).toHaveCount(0);
        const retouchedToolbar = page.getByRole('region', { name: '보정본 작업 도구' });
        await expect(retouchedToolbar.getByRole('button', { name: /일괄 (업로드|교체)/ })).toHaveCount(0);
        await expect(retouchedToolbar.getByText(/^(1차 보정|재보정)\s*·?\s*\d+장$/)).toHaveCount(0);
        const partialUploadActionBar = page.locator('[data-photographer-page-action-bar]');
        await expect(partialUploadActionBar.getByRole('button', { name: '일괄 업로드', exact: true })).toBeVisible();
        await expect(partialUploadActionBar.getByRole('button', { name: '보정본 검토 요청', exact: true })).toBeHidden();
        const toolsBox = (await retouchedToolbar.boundingBox())!;
        expect(toolsBox.height).toBe(44);
        await expect(page.locator('[data-retouched-mapping-row="true"]').filter({ hasText: "보정본을 추가해주세요" }).first()).toBeVisible();
        const media = mappedRow.locator('[data-original-photo-list-thumbnail]');
        await expect.poll(async () => (await media.first().boundingBox())?.width ?? 0).toBeGreaterThan(100);
        const filenameStyle = await mappedRow.locator('[data-photo-asset-filename] > span').first().evaluate((element) => {
          const css = getComputedStyle(element);
          return { font: css.font, color: css.color, whiteSpace: css.whiteSpace, textOverflow: css.textOverflow };
        });
        const originalBox = (await media.first().boundingBox())!;
        const retouchedBox = (await media.last().boundingBox())!;
        expect(Math.abs(originalBox.y - retouchedBox.y)).toBeLessThanOrEqual(1);
        const filenameBox = (await mappedRow.locator('span[title]').first().boundingBox())!;
        expect(filenameBox.y + filenameBox.height).toBeLessThanOrEqual(originalBox.y);
        const arrowBox = (await mappedRow.locator('[data-mobile-mapping-arrow]').boundingBox())!;
        expect(arrowBox.x).toBeGreaterThanOrEqual(originalBox.x + originalBox.width - 1);
        expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(retouchedBox.x + 1);
        expect(Math.abs(arrowBox.y + arrowBox.height / 2 - originalBox.y - originalBox.height / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(originalBox.width - retouchedBox.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(originalBox.height - retouchedBox.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(originalBox.width / originalBox.height - 218.32 / 150.7)).toBeLessThan(.03);
        await expect(mappedRow.getByRole("button", { name: /선택$/ })).toHaveCount(0);
        await media.last().tap();
        const viewer = page.locator('[data-original-photo-viewer]');
        await expect(viewer.locator('figure')).toHaveCount(0);
        const modes = viewer.getByRole('group', { name: '사진 보기 모드' });
        await expect(modes.getByRole('button')).toHaveCount(2);
        await expect(modes.getByRole('button', { name: '비교', exact: true })).toHaveCount(0);
        await expect(viewer.getByRole('button', { name: '사진 집중 보기' })).toHaveCount(0);
        await expect(modes.getByRole('button', { name: '보정본', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const retouchedMode = modes.getByRole('button', { name: '보정본', exact: true });
        await retouchedMode.tap();
        expect(await retouchedMode.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
        await retouchedMode.focus();
        await page.keyboard.press('Space');
        await expect(retouchedMode).toBeFocused();
        expect(await retouchedMode.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
        await retouchedMode.tap();
        expect((await retouchedMode.boundingBox())!.height).toBeGreaterThanOrEqual(44);

        await viewer.locator('[data-original-photo-filmstrip] button').nth(1).tap();
        await expect(modes.getByRole('button', { name: '보정본', exact: true })).toHaveAttribute('aria-pressed', 'true');
        const empty = viewer.locator('[data-retouched-empty]');
        await expect(empty).toContainText('아직 보정본이 업로드되지 않았습니다');
        await expect(empty.getByRole('img', { name: 'A-CUT' })).toBeVisible();
        await page.setViewportSize({ width: 320, height: 568 });
        expect(await empty.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: `/tmp/mobile-viewer-empty-${browserName}.png` });
        await page.setViewportSize({ width: 402, height: 874 });
        await expect(viewer.locator('[data-viewer-image]')).toHaveCount(0);
        await expect(viewer.locator('[data-original-photo-filmstrip] button').nth(1)).toContainText('미업로드');
        await expect(viewer.getByRole('button', { name: '버전 이력 보기' })).toHaveCount(0);
        const modeBounds = (await modes.boundingBox())!;
        await modes.getByRole('button', { name: '원본', exact: true }).tap();
        await expect(empty).toHaveCount(0);
        await expect(viewer.locator('[data-viewer-image] img:not([aria-hidden="true"])')).toBeVisible();
        expect((await modes.boundingBox())!.height).toBe(modeBounds.height);
        await modes.getByRole('button', { name: '보정본', exact: true }).tap();
        await expect(empty).toBeVisible();
        await expect(viewer.locator('[data-viewer-comments]')).toHaveCount(0);
        await viewer.locator('[data-original-photo-filmstrip] button').first().tap({ position: { x: 60, y: 8 } });
        await expect(viewer.locator('figure')).toHaveCount(0);
        await expect(viewer.locator('[data-viewer-comments]')).toHaveCount(0);
        await page.setViewportSize({ width: 320, height: 568 });
        await page.setViewportSize({ width: 402, height: 874 });
        await modes.getByRole('button', { name: '보정본', exact: true }).tap();
        await expect(viewer.locator('figure')).toHaveCount(0);
        await expect(viewer.locator('figure')).toHaveCount(0);
        await modes.getByRole('button', { name: '원본', exact: true }).tap();
        const mainPhoto = viewer.locator('[data-viewer-image] img:not([aria-hidden="true"])');
        expect((await mainPhoto.boundingBox())!.width).toBeGreaterThan(370);
        const pictureBounds = (await mainPhoto.boundingBox())!;
        const nextBounds = (await viewer.getByRole('button', { name: '다음 사진', exact: true }).boundingBox())!;
        expect(Math.abs(nextBounds.y + nextBounds.height / 2 - pictureBounds.y - pictureBounds.height / 2)).toBeLessThanOrEqual(1);
        await mainPhoto.tap();
        await expect(viewer).toHaveAttribute('data-mobile-focus', 'true');
        await expect(modes).toBeHidden();
        await expect(viewer.locator('[data-original-photo-filmstrip]')).toBeHidden();
        await mainPhoto.tap();
        await expect(modes).toBeVisible();
        await mainPhoto.tap();
        await mainPhoto.tap();
        await expect.poll(() => mainPhoto.locator('..').evaluate((element) => element.style.transform)).toContain('scale(2)');
        const swipePhoto = async (dx: number) => {
          await mainPhoto.evaluate((element, delta) => {
            const box = element.getBoundingClientRect();
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            const touch = (offset: number) => ({ identifier: 1, target: element, clientX: x + offset, clientY: y });
            const emit = (type: string, offset: number, ended = false) => {
              const event = new Event(type, { bubbles: true, cancelable: true });
              Object.defineProperties(event, { touches: { value: ended ? [] : [touch(offset)] }, changedTouches: { value: [touch(offset)] } });
              element.dispatchEvent(event);
            };
            emit('touchstart', 0);
            emit('touchmove', delta);
            emit('touchend', delta, true);
          }, dx);
        };
        await swipePhoto(-80);
        await expect(viewer.locator('[data-original-photo-filmstrip] button').first()).toHaveAttribute('data-active', 'true');

        await expect(modes).toBeVisible();
        await mainPhoto.tap();
        await mainPhoto.tap();
        await expect.poll(() => mainPhoto.locator('..').evaluate((element) => element.style.transform)).toContain('scale(1)');
        await swipePhoto(-80);
        await expect(viewer.locator('[data-original-photo-filmstrip] button').nth(1)).toHaveAttribute('data-active', 'true');
        await expect(mainPhoto).toBeVisible();
        await swipePhoto(80);
        await expect(viewer.locator('[data-original-photo-filmstrip] button').first()).toHaveAttribute('data-active', 'true');
        await expect(mainPhoto).toBeVisible();
        const surfaces = await viewer.locator('header, [data-viewer-stage], [data-original-photo-filmstrip]').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
        expect(new Set(surfaces).size).toBe(1);

        await page.screenshot({ path: `/tmp/mobile-viewer-accessibility-${browserName}.png` });
        await viewer.getByRole('button', { name: '사진 상세 보기 닫기' }).tap();
        const retouchedColumnHeader = page.getByRole('columnheader', { name: /보정본/ });
        const selectAll = retouchedColumnHeader.getByRole('checkbox', { name: '현재 목록 보정본 전체 선택', exact: true });
        const columnLabelX = await retouchedColumnHeader.locator('[data-mobile-retouched-column-label]').evaluate((element) => element.getBoundingClientRect().x);
        const retouchedFilenameX = await mappedRow.locator('[data-photo-asset-filename]').nth(1).evaluate((element) => element.getBoundingClientRect().x);
        expect(Math.abs(columnLabelX - retouchedFilenameX)).toBeLessThanOrEqual(2);
        await expect(selectAll).not.toBeChecked();
        await selectAll.tap();
        await expect(selectAll).toBeChecked();
        await expect(page.locator('[data-project-asset-toolbar]').getByRole('button', { name: /선택 삭제/ })).toHaveCount(0);
        const selectionActionBar = page.locator('[data-photographer-page-action-bar]');
        await expect(selectionActionBar.getByText('1장 선택됨', { exact: true })).toBeVisible();
        await expect(selectionActionBar.getByRole('button', { name: '선택 삭제 1장', exact: true })).toHaveAttribute('data-variant', 'primary');
        await expect(selectionActionBar.getByRole('button', { name: '선택 해제', exact: true })).toHaveCount(0);
        await selectAll.tap();
        await expect(selectAll).not.toBeChecked();
        await expect(mappedRow.getByRole('button', { name: /선택 해제$/ })).toHaveCount(0);
        await page.screenshot({ path: `/tmp/mobile-retouched-comments-${browserName}.png` });
        await page.setViewportSize({ width: 320, height: 568 });
        await assertTabs();
        expect(await page.locator('main[data-mobile-asset-workspace]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        const mappingRows = page.locator('[data-retouched-mapping-row="true"]');
        await expect.poll(async () => {
          const first = await mappingRows.nth(0).boundingBox();
          const second = await mappingRows.nth(1).boundingBox();
          return first && second ? second.y - first.y - first.height : -Infinity;
        }).toBeGreaterThanOrEqual(-1);
        await page.setViewportSize({ width: 402, height: 874 });

        await page.getByRole("tab", { name: "원본", exact: true }).tap();
        await expect(page.getByRole("tab", { name: "원본", exact: true })).toHaveAttribute("aria-selected", "true");
        await assertTabs();
        await page.locator("[data-original-photo-card]").first().waitFor();
        await page.evaluate(() => {
          const scroller = [...document.querySelectorAll<HTMLElement>("main *")].find((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 100);
          if (scroller) scroller.scrollTop = 240;
        });
        await assertTabs();
        await page.getByRole("tab", { name: "셀렉", exact: true }).tap();
        await expect(page.getByRole("tab", { name: "셀렉", exact: true })).toHaveAttribute("aria-selected", "true");
        await page.evaluate(() => { document.querySelectorAll<HTMLElement>('main *').forEach((element) => { if (/auto|scroll/.test(getComputedStyle(element).overflowY)) { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); } }); });
        const selectedToolbar = page.locator('[data-project-asset-toolbar][aria-label="셀렉 결과 도구"]');
        await expect.poll(async () => (await selectedToolbar.boundingBox())?.height ?? 0).toBe(toolsBox.height);
        const selectedFilename = page.locator('[data-original-photo-card] [data-photo-asset-filename] > span').first();
        await expect(selectedFilename).toBeVisible();
        expect(await selectedFilename.evaluate((element) => {
          const css = getComputedStyle(element);
          return { font: css.font, color: css.color, whiteSpace: css.whiteSpace, textOverflow: css.textOverflow };
        })).toEqual(filenameStyle);
        expect(retouchedCardFilenameColor).toBe(filenameStyle.color);
        const selectedCard = page.locator('[data-original-photo-card]').filter({ visible: true }).first();
        await selectedCard.getByRole('button', { name: /상세 보기$/ }).tap();
        const selectedViewer = page.locator('[data-original-photo-viewer]');
        await expect(selectedViewer).toHaveAttribute('data-mobile-details', 'true');
        const selectedViewerComment = selectedViewer.locator('[data-viewer-comments]').filter({ visible: true });
        await expect(selectedViewerComment.getByRole('heading', { name: '셀렉 코멘트' })).toBeVisible();
        await expect(selectedViewerComment).toContainText(selectionComment);
        await expect(selectedViewerComment).not.toContainText(retouchComment);
        const selectedViewerPhoto = selectedViewer.locator('[data-viewer-image] img:not([aria-hidden="true"])');
        await expect(selectedViewerPhoto).toBeVisible();
        expect((await selectedViewerPhoto.boundingBox())!.width).toBeGreaterThan(370);
        await expect(selectedViewer.locator('[data-viewer-stage]')).toHaveCSS('padding-left', '8px');
        await selectedViewer.getByRole('button', { name: '사진 상세 보기 닫기' }).tap();

        await assertTabs();
        await page.getByRole("tab", { name: "보정본", exact: true }).tap();
        await expect(page.getByRole("tab", { name: "보정본", exact: true })).toHaveAttribute("aria-selected", "true");
        await assertTabs();
        await page.locator('[data-photographer-page-action-bar]').getByRole("button", { name: "일괄 업로드", exact: true }).tap();
        const dialog = page.getByRole("dialog", { name: "보정본 업로드", exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('[data-upload-title-icon]')).toBeHidden();
        await expect(dialog.getByRole('heading', { name: '보정본 업로드', exact: true })).toHaveCSS('font-size', '20px');
        for (const width of [402, 320]) {
          await page.setViewportSize({ width, height: width === 320 ? 568 : 874 });
          const summary = dialog.locator("[data-upload-selection-summary]");
          await expect(summary).toContainText(/0\/\d+장 선택/);
          await expect(summary.getByText('선택 초기화', { exact: true })).toBeHidden();
          const geometry = await summary.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, height: element.getBoundingClientRect().height }));
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
          expect(geometry.height).toBeLessThanOrEqual(56);
          expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        }
        await expect(dialog.getByText(/파일명이 같으면 자동 매핑/)).toBeHidden();
        const manualMappingButton = dialog.getByRole('button', { name: '사진별 선택', exact: true });
        await expect(manualMappingButton).toBeVisible();
        await manualMappingButton.tap();
        const serverMappingRow = dialog.locator('[data-mapping-state="server"]').first();
        const manualMappingButtonBox = await manualMappingButton.boundingBox();
        const serverMappingRowBox = await serverMappingRow.boundingBox();
        expect((serverMappingRowBox?.y ?? 0) - ((manualMappingButtonBox?.y ?? 0) + (manualMappingButtonBox?.height ?? 0))).toBeLessThanOrEqual(20);
        await expect(serverMappingRow).toHaveCSS('border-left-width', '1px');
        await expect(serverMappingRow).toHaveCSS('border-radius', '14px');
        await expect(serverMappingRow.getByText('원본', { exact: true })).toBeHidden();
        const mappingThumbs = serverMappingRow.locator('.uvp-mapping-thumb');
        const originalThumbBox = await mappingThumbs.first().boundingBox();
        const retouchedThumbBox = await mappingThumbs.last().boundingBox();
        expect(originalThumbBox?.width ?? 0).toBeGreaterThanOrEqual(72);
        expect(Math.abs((originalThumbBox?.width ?? 0) - (retouchedThumbBox?.width ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((originalThumbBox?.height ?? 0) - (retouchedThumbBox?.height ?? 0))).toBeLessThanOrEqual(1);
        const sourceFilenameBox = await serverMappingRow.locator('.uvp-source-filename').boundingBox();
        const retouchedFilenameBox = await serverMappingRow.locator('.uvp-retouch-filename').boundingBox();
        expect(sourceFilenameBox?.y ?? Infinity).toBeLessThan(originalThumbBox?.y ?? 0);
        expect(retouchedFilenameBox?.y ?? Infinity).toBeLessThan(retouchedThumbBox?.y ?? 0);
        await expect(serverMappingRow.getByRole('button', { name: /업로드 파일 변경$/ })).toBeVisible();
        const serverDeleteButton = serverMappingRow.getByRole('button', { name: /업로드된 보정본 삭제$/ });
        await expect(serverDeleteButton).toHaveCSS('width', '44px');
        await expect(serverDeleteButton).toHaveCSS('height', '44px');
        await expect(serverDeleteButton.locator('.lucide-x')).toBeVisible();
        await expect(serverDeleteButton.locator('[data-remove-retouch-face]')).toHaveCSS('width', '24px');
        await expect(serverDeleteButton.locator('[data-remove-retouch-face]')).toHaveCSS('height', '24px');
        const removeFaceBox = await serverDeleteButton.locator('[data-remove-retouch-face]').boundingBox();
        expect(Math.abs((retouchedThumbBox?.x ?? 0) + (retouchedThumbBox?.width ?? 0) - ((removeFaceBox?.x ?? 0) + (removeFaceBox?.width ?? 0)))).toBeLessThanOrEqual(2);
        expect(Math.abs((retouchedThumbBox?.y ?? 0) - (removeFaceBox?.y ?? 0))).toBeLessThanOrEqual(2);
        await serverDeleteButton.tap();
        const deleteDialog = page.getByRole('dialog', { name: '보정본을 삭제할까요?', exact: true });
        await expect(deleteDialog).toHaveAttribute('data-confirmation-density', 'compact');
        await expect(deleteDialog).toHaveCSS('padding-left', '20px');
        await expect(deleteDialog.getByRole('heading')).toHaveCSS('font-size', '20px');
        await expect(deleteDialog.getByText('삭제한 보정본은 복구할 수 없습니다.', { exact: true })).toBeVisible();
        await expect(deleteDialog.getByText(/연결된 보정본을 삭제합니다/)).toHaveCount(0);
        await expect(deleteDialog.locator('[data-confirm-detail]')).toHaveCount(0);
        await deleteDialog.getByRole('button', { name: '취소', exact: true }).tap();
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await assertTabs();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect(page.locator('.photographer-mobile-header')).toBeHidden();
        await expect.poll(async () => (await mappedRow.locator('[data-original-photo-list-thumbnail]').first().boundingBox())?.width ?? 0).toBe(52);
        await page.getByRole('button', { name: '갤러리로 보기', exact: true }).click();
        await expect(assetGrid).toBeVisible();
        const desktopCard = workflowCards.filter({ hasText: retouchedFilename });
        const desktopCheckbox = desktopCard.getByRole('checkbox', { name: /보정본 선택$/ });
        const desktopImage = desktopCard.getByRole('img', { name: 'V1', exact: true });
        const replaceControl = desktopCard.locator('label[aria-label$="보정본 교체"]');
        const replaceVisual = replaceControl.locator('span').first();
        await expect(desktopCheckbox).toBeVisible();
        await expect(replaceControl).toBeVisible();
        const [checkboxBox, imageBox, replaceBox, replaceVisualBox] = await Promise.all([
          desktopCheckbox.boundingBox(),
          desktopImage.boundingBox(),
          replaceControl.boundingBox(),
          replaceVisual.boundingBox(),
        ]);
        expect(checkboxBox).not.toBeNull();
        expect(imageBox).not.toBeNull();
        expect(replaceBox).not.toBeNull();
        expect(replaceVisualBox).not.toBeNull();
        expect(Math.abs(checkboxBox!.x - imageBox!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(checkboxBox!.y - imageBox!.y)).toBeLessThanOrEqual(1);
        expect(replaceBox!.width).toBeGreaterThanOrEqual(44);
        expect(replaceBox!.height).toBeGreaterThanOrEqual(44);
        expect(replaceVisualBox!.width).toBe(28);
        expect(replaceVisualBox!.height).toBe(28);
        expect(Math.abs(replaceVisualBox!.x + replaceVisualBox!.width - (imageBox!.x + imageBox!.width))).toBeLessThanOrEqual(1);
        expect(Math.abs(replaceVisualBox!.y + replaceVisualBox!.height - (imageBox!.y + imageBox!.height))).toBeLessThanOrEqual(1);
        // Gallery cards stay image-focused regardless of review feedback; detail/list views retain comments.
        reviewStatus = "approved";
        await page.reload();
        await expect(retouchedGridCard).not.toContainText(retouchComment);
        await expect(retouchedGridCard).not.toContainText(selectionComment);
        await expect(retouchedGridCard.getByText('수정 요청', { exact: true })).toHaveCount(0);
        await expect(page.locator('[data-project-asset-toolbar]').getByText('검토 결과', { exact: true })).toHaveCount(0);
        await page.screenshot({ path: `/tmp/retouched-feedback-desktop-${browserName}.png` });
        hasReviewComment = false;
        await page.reload();
        await expect(retouchedGridCard).not.toContainText(selectionComment);

        // A first-round gallery must never offer the second-round review action.
        hasReviewComment = true;
        reviewStatus = "revision_requested";
        fixtureStatus = "editing_v2";
        await page.setViewportSize({ width: 402, height: 874 });
        await page.goto(`/photographer/projects/${project.projectId}/assets/retouched?round=v1`);
        const roundTrigger = page.locator('[data-mobile-retouch-stage-trigger]');
        await expect(roundTrigger).toContainText('1/2 1차 보정');
        await expect(retouchedGridCard).not.toContainText(retouchComment);
        const roundFooter = page.locator('[data-photographer-page-action-bar]');
        await expect(roundFooter).toContainText('1차 보정 검토 완료');
        await expect(roundFooter.getByRole('button', { name: /검토 요청|일괄 업로드/ })).toHaveCount(0);
        await page.getByRole('img', { name: 'V1', exact: true }).filter({ visible: true }).first().tap();
        const revisionViewer = page.locator('[data-original-photo-viewer]');
        const currentReviewComment = revisionViewer.locator('[data-viewer-comments]').filter({ visible: true });
        await expect(currentReviewComment.getByRole('heading', { name: '재보정 요청' })).toBeVisible();
        await expect(currentReviewComment).toContainText(retouchComment);
        await expect(currentReviewComment).not.toContainText(selectionComment);
        await revisionViewer.getByRole('button', { name: '사진 상세 보기 닫기' }).tap();
        await roundTrigger.click();
        const stageSheet = page.getByRole('dialog', { name: '보정 단계' });
        await expect(stageSheet.getByText('현재 진행 단계', { exact: true })).toBeVisible();
        await stageSheet.getByRole('button', { name: /재보정 현재 진행 단계/ }).click();
        await expect(roundTrigger).toContainText('2/2 재보정');
        await expect(roundFooter.getByRole('button', { name: '일괄 업로드', exact: true })).toBeVisible();
        for (const width of [402, 320]) {
          await page.setViewportSize({ width, height: 874 });
          const toolbar = page.locator('[data-project-asset-toolbar]');
          expect(await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        }
        await page.screenshot({ path: `/tmp/retouched-feedback-round-${browserName}.png` });
        hasSecondVersion = true;
        await page.reload();
        await expect(roundFooter).toContainText('재보정본 1장 준비 완료');
        await expect(roundFooter.getByRole('button', { name: '재보정본 검토 요청', exact: true })).toBeEnabled();
        await page.locator('[data-mobile-retouch-stage-trigger]').click();
        await page.getByRole('dialog', { name: '보정 단계' }).getByRole('button', { name: /1차 보정 완료된 단계/ }).click();
        await expect(roundFooter.getByRole('button', { name: '재보정본 검토 요청', exact: true })).toHaveCount(0);

        fixtureStatus = "delivered";
        await setProjectStatus(page, project.projectId, "delivered");
        await page.setViewportSize({ width: 402, height: 874 });
        await page.goto(`/photographer/projects/${project.projectId}/assets/selected`);
        const deliveredActionBar = page.locator('[data-photographer-page-action-bar]');
        await expect(deliveredActionBar).toBeHidden();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect(deliveredActionBar).toBeVisible();
        await expect(deliveredActionBar).toContainText('납품 완료');
        await expect(deliveredActionBar.getByText('보정 작업 보기', { exact: true })).toHaveCount(0);
        await page.goto(`/photographer/projects/${project.projectId}/assets/final`, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await expect(page.getByRole('tab', { name: '최종본', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('재보정 요청', { exact: true }).filter({ visible: true })).toHaveCount(0);
        await expect(page.getByRole('region', { name: '최종본 작업 도구' })).toContainText('최종 확정본');
      } finally { try { await deleteTestProject(page, project.projectId); } finally { await browser.close(); } }
    });
}
