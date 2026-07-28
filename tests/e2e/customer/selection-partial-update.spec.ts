/**
 * 회귀 테스트 — `/api/c/selections`가 body에 없는 필드를 건드리지 않는지 검증.
 *
 * 배경: 과거엔 요청 body에 없는 필드(rating/color_tag/comment)를 서버가 항상 null로
 * 강제 upsert했다. 프론트(SelectionContext)는 필드 하나만 바뀌어도 로컬 캐시 전체를
 * 재전송했는데, 이 로컬 캐시가 다른 세션의 최신 변경사항을 모르는 상태(폴링/새로고침 전)이면
 * 그 다른 세션이 저장한 값이 통째로 지워졌다. 이 스펙은 API 레벨에서 "생략된 필드는
 * 기존 값을 유지한다"는 계약을 직접 검증한다(두 세션이 실제로 동시 접속하는 브라우저
 * 시나리오는 qa-verifier가 별도로 검증).
 *
 * 실행: npx playwright test tests/e2e/customer/selection-partial-update.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { setupFullProject, deleteTestProject, type TestProject } from "../../helpers/setup";
import { loginAsPhotographer } from "../../helpers/auth";

let project: TestProject;
let photoId: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 3);
  // PIN 없는 프로젝트는 갤러리 접근 시 auto-verify로 쿠키가 자동 발급된다.
  await page.goto(project.galleryUrl, { waitUntil: "networkidle" });
  const photosRes = await page.request.get(
    `/api/c/photos?token=${encodeURIComponent(project.accessToken)}`
  );
  const photosBody = await photosRes.json();
  photoId = photosBody.photos[0].id;
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

async function getSelectionState(page: Page) {
  const res = await page.request.get(
    `/api/c/selections?token=${encodeURIComponent(project.accessToken)}&project_id=${encodeURIComponent(project.projectId)}`
  );
  expect(res.ok()).toBe(true);
  const body = await res.json();
  return body.photoStates[photoId] as { rating?: number; color?: string[]; comment?: string } | undefined;
}

test.describe("selections 부분 업데이트(partial update) 회귀 테스트", () => {
  test("P1: color_tag만 보낸 요청이 이전에 저장된 rating/comment를 지우지 않는다", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(project.galleryUrl, { waitUntil: "networkidle" });

    // 1) 별점+색상+코멘트를 모두 저장
    const res1 = await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        rating: 5,
        color_tag: "red",
        comment: "a",
      },
    });
    expect(res1.ok()).toBe(true);

    // 2) 색상만 바꿔서 재요청 (rating/comment 키 자체를 생략 — updatePhotoState()가 실제로 보내는 형태)
    const res2 = await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        color_tag: "blue",
      },
    });
    expect(res2.ok()).toBe(true);

    const state = await getSelectionState(page);
    expect(state?.rating).toBe(5);
    expect(state?.comment).toBe("a");
    expect(state?.color).toEqual(["blue"]);

    await ctx.close();
  });

  test("P2: is_selected만 보낸 요청(toggle)이 rating/color/comment를 지우지 않는다", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(project.galleryUrl, { waitUntil: "networkidle" });

    await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        rating: 4,
        color_tag: "green",
        comment: "b",
      },
    });

    // toggle()이 실제로 보내는 형태: is_selected만 포함
    const toggleRes = await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        is_selected: true,
      },
    });
    expect(toggleRes.ok()).toBe(true);

    const state = await getSelectionState(page);
    expect(state?.rating).toBe(4);
    expect(state?.comment).toBe("b");
    expect(state?.color).toEqual(["green"]);

    await ctx.close();
  });

  test("P3: 명시적으로 null을 보낸 필드는 실제로 지워진다(생략과 구분됨)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(project.galleryUrl, { waitUntil: "networkidle" });

    await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        rating: 3,
        color_tag: "purple",
        comment: "c",
      },
    });

    // rating을 명시적으로 null로 지움(별점 취소 재현) — color_tag/comment는 생략(안 건드림)
    await page.request.post("/api/c/selections", {
      data: {
        token: project.accessToken,
        project_id: project.projectId,
        photo_id: photoId,
        rating: null,
      },
    });

    const state = await getSelectionState(page);
    expect(state?.rating).toBeUndefined();
    expect(state?.comment).toBe("c");
    expect(state?.color).toEqual(["purple"]);

    await ctx.close();
  });
});
