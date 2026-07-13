import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { loginAsPhotographer } from "../../helpers/auth";
import { createEditingProject, deleteTestProject, type TestProject } from "../../helpers/setup";

/**
 * BUG-04 회귀 테스트: 고객이 보정본 검토 페이지에서 "확정"을 선택한 뒤
 * 최종 제출(작가에게 전달) 전에 새로고침하면 선택이 전부 사라지던 문제.
 * ReviewContext가 sessionStorage에 임시 저장하도록 수정했다.
 * 백엔드(FastAPI)가 로컬에서 실행 중이어야 통과한다(실제 V1 업로드 필요).
 */
let project: TestProject;
let sourceFilePath: string;

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

  // 원본과 이름이 같은 보정본 파일을 준비해 exact 매칭되게 한다.
  sourceFilePath = path.join(__dirname, "..", "..", "fixtures", "sample.jpg");
  const renamedPath = path.join(path.dirname(sourceFilePath), "E2E_TEST_001.jpg");
  fs.copyFileSync(sourceFilePath, renamedPath);

  await setupPage.goto(`/photographer/projects/${project.projectId}/workflow`);
  await setupPage.waitForLoadState("networkidle");
  await setupPage.getByRole("button", { name: /^V1/i }).first().click();
  await setupPage
    .getByRole("button", { name: /보정본 업로드|V1 업로드|업로드 시작|보정 시작/i })
    .first()
    .click();
  await setupPage.locator('input[type="file"][multiple]').setInputFiles(renamedPath);
  const uploadBtn = setupPage.getByRole("button", { name: /^업로드$/i });
  await expect(uploadBtn).toBeEnabled({ timeout: 8000 });
  await uploadBtn.click();
  // 업로드 버튼 자체가 안 보이게 된 뒤에도 패널 컨테이너가 잠시 남아 뒤 버튼 클릭을
  // 가로챌 수 있으므로, 패널 헤딩이 완전히 사라질 때까지 기다린다.
  await expect(
    setupPage.getByRole("heading", { name: "V1 보정본 업로드" })
  ).not.toBeVisible({ timeout: 20000 });

  fs.rmSync(renamedPath, { force: true });

  // "보정본 검토 요청" → 기한 설정 모달 → 확정 → 공유 모달
  await setupPage.getByRole("button", { name: "보정본 검토 요청" }).first().click();
  await expect(
    setupPage.getByRole("heading", { name: "고객에게 보정본 검토 요청" })
  ).toBeVisible({ timeout: 8000 });
  await setupPage.getByRole("button", { name: "보정본 검토 요청" }).last().click();
  await expect(setupPage.getByText(/고객이 V1 보정본을 검토 중입니다/)).toBeVisible({ timeout: 15000 });

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

    // 모바일/데스크톱 어느 쪽이든 결국 개별 사진 상세로 이동한다.
    await page.waitForURL(/\/review\/[a-f0-9-]+$/, { timeout: 15000 }).catch(() => {});
    if (!/\/review\/[a-f0-9-]+$/.test(page.url())) {
      await page.locator("a, button").filter({ hasText: /검토|확인/ }).first().click().catch(() => {});
      await page.waitForURL(/\/review\/[a-f0-9-]+$/, { timeout: 10000 });
    }

    // Y 키(물리 키코드)로 확정 — review/[photoId]/page.tsx의 단축키와 동일
    await page.keyboard.press("y");
    await expect(page.getByText("확정됨").first()).toBeVisible({ timeout: 8000 });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("확정됨").first()).toBeVisible({ timeout: 8000 });

    await ctx.close();
  });
});
