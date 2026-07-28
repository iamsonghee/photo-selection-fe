/**
 * 회귀 테스트 — 같은 고객 링크(token)를 두 브라우저 컨텍스트(A, B)가 동시에 열어
 * 서로 다른 필드를 실제 UI로 조작해도 데이터가 유실되지 않는지 검증.
 *
 * 배경: 사용자 문의 — "고객이 보는 원본셀렉 화면에서 A가 초록 컬러칩, B가 노랑
 * 컬러칩을 고르면 둘 다 반영된 것처럼 보이나, 실시간이 안 되는 건가?" 조사 결과,
 * 실시간 미반영뿐 아니라 서로 다른 필드(별점 vs 색상)를 만져도 나중 요청이 로컬
 * 캐시 전체를 재전송해 먼저 저장된 값을 지우는 데이터 유실 버그가 있었다(수정됨).
 * 이 스펙은 실제 뷰어 UI(별점 클릭 / 색상칩 클릭)를 통해 그 파이프라인 전체
 * (프론트 이벤트 → API → DB)를 검증한다. 폴링으로 새로고침 없이 화면에 반영되는지의
 * 시각적 확인은 qa-verifier가 별도로 수행한다.
 *
 * 실행: npx playwright test tests/e2e/customer/selection-concurrent-sync.spec.ts
 */

import { test, expect } from "@playwright/test";
import { setupFullProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;
let photoId: string;
let viewerUrl: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 3);
  await page.goto(project.galleryUrl, { waitUntil: "networkidle" });
  const photosRes = await page.request.get(
    `/api/c/photos?token=${encodeURIComponent(project.accessToken)}`
  );
  const photosBody = await photosRes.json();
  photoId = photosBody.photos[0].id;
  viewerUrl = `/c/${project.accessToken}/viewer/${photoId}`;
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test("C1: A가 별점, B가 색상칩을 거의 동시에 저장해도 서버에 둘 다 남는다", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(viewerUrl, { waitUntil: "networkidle" });
  await pageB.goto(viewerUrl, { waitUntil: "networkidle" });

  // A: 별점 5점 클릭 (실제 updatePhotoState() 경로)
  const stars = pageA.locator(".fs-star");
  await expect(stars).toHaveCount(5, { timeout: 8000 });
  await stars.nth(4).click();

  // B: 빨간 색상칩 클릭 — A의 로컬 캐시가 이 변경을 모르는 상태에서 요청을 보낸다
  const redChip = pageB.locator('button[title="red"]');
  await expect(redChip).toBeVisible({ timeout: 8000 });
  await redChip.click();

  // 두 fire-and-forget 요청이 서버에 반영될 시간을 준다
  await pageA.waitForTimeout(1500);

  const res = await pageA.request.get(
    `/api/c/photos?token=${encodeURIComponent(project.accessToken)}`
  );
  const body = await res.json();
  const photo = body.photos.find((p: { id: string }) => p.id === photoId);
  expect(photo?.tag?.star).toBe(5);
  expect(photo?.tag?.color).toEqual(["red"]);

  await ctxA.close();
  await ctxB.close();
});

test("C2: 코멘트를 남긴 뒤 다른 세션이 선택 토글을 해도 코멘트가 지워지지 않는다", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto(viewerUrl, { waitUntil: "networkidle" });
  await pageB.goto(viewerUrl, { waitUntil: "networkidle" });

  const commentBox = pageA.locator('input[placeholder="코멘트..."]:visible').first();
  await expect(commentBox).toBeVisible({ timeout: 8000 });
  await commentBox.fill("코멘트 유지 테스트");
  await commentBox.blur();
  await pageA.waitForTimeout(800);

  // B: 사진 선택 토글 (Space) — is_selected만 보내는 경로
  await pageB.keyboard.press("Space");
  await pageB.waitForTimeout(800);

  const res = await pageA.request.get(
    `/api/c/photos?token=${encodeURIComponent(project.accessToken)}`
  );
  const body = await res.json();
  const photo = body.photos.find((p: { id: string }) => p.id === photoId);
  expect(photo?.selected).toBe(true);

  const selRes = await pageA.request.get(
    `/api/c/selections?token=${encodeURIComponent(project.accessToken)}&project_id=${encodeURIComponent(project.projectId)}`
  );
  const selBody = await selRes.json();
  expect(selBody.photoStates[photoId]?.comment).toBe("코멘트 유지 테스트");

  await ctxA.close();
  await ctxB.close();
});
