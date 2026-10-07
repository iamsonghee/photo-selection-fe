import { test, expect } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createEditingProject, deleteTestProject, type TestProject } from "../../helpers/setup";

/**
 * BUG-04 회귀 테스트: 고객이 보정본 검토 페이지에서 "확정"을 선택한 뒤
 * 최종 제출(작가에게 전달) 전에 새로고침하면 선택이 전부 사라지던 문제.
 * ReviewContext가 sessionStorage에 임시 저장하도록 수정했다.
 * 백엔드(FastAPI)가 로컬에서 실행 중이어야 통과한다(실제 V1 업로드 필요).
 */
let project: TestProject;

test.beforeAll(async ({ browser }) => {
  const health = await fetch("http://localhost:8000/health").catch(() => null);
  test.skip(!health?.ok, "FastAPI backend(localhost:8000)가 실행 중이지 않아 스킵");

  const setupPage = await browser.newPage();
  await loginAsPhotographer(setupPage);
  // photoCount=1 → 선택된 사진 1장 → V1 패널 대상도 1장이라 업로드 1건으로
  // "보정본 검토 요청" 게이트(v1Uploaded === total)를 바로 통과할 수 있다.
  project = await createEditingProject(setupPage, 1);
  await setupPage.request.patch(`/api/photographer/projects/${project.projectId}`, {
    data: { max_revision_count: 2 },
  });

  // 이 테스트의 대상은 고객 검토 화면이다 — 작가 업로드 UI(2026-10 개편으로 바뀜)를 거치지 않고
  // 테스트 API로 V1 보정본을 넣고 검토 단계로 바로 옮긴다.
  const photosResponse = await setupPage.request.get(`/api/photographer/projects/${project.projectId}/photos`);
  const { photos } = await photosResponse.json() as { photos: Array<{ id: string }> };
  const seeded = await setupPage.request.post("/api/auth/test-setup", {
    data: { action: "seed_photo_version", projectId: project.projectId, photoIds: [photos[0].id] },
  });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const moved = await setupPage.request.post("/api/auth/test-setup", {
    data: { action: "set_project_status", projectId: project.projectId, status: "reviewing_v1" },
  });
  expect(moved.ok(), await moved.text()).toBe(true);

  await setupPage.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 — 보정본 검토 새로고침 (BUG-04 회귀)", () => {
  test("확정 선택 후 새로고침해도 검토 상태가 유지된다", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(`/c/${project.accessToken}/review`);
    await page.waitForLoadState("networkidle");

    // 검토 목록 하단의 '미검토 사진 보기'로 첫 미검토 사진 상세에 들어간다.
    await page.getByRole("button", { name: "미검토 사진 보기" }).click();
    await page.waitForURL(/\/review\/[a-f0-9-]+$/, { timeout: 10000 });

    // 판단 패널의 '확정' 버튼으로 확정한다(단축키 Y와 같은 동작).
    await page.getByRole("button", { name: /^확정/ }).first().click();
    await expect(page.getByText("확정됨").first()).toBeVisible({ timeout: 8000 });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("확정됨").first()).toBeVisible({ timeout: 8000 });

    await ctx.close();
  });
});
