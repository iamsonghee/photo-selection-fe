import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loginAsPhotographer } from "../../helpers/auth";
import { createEditingProject, deleteTestProject, type TestProject } from "../../helpers/setup";

/**
 * BUG-05 회귀 테스트: 보정본 업로드 시 서버가 일부 파일(빈 파일 등)을 조용히
 * 스킵해도(HTTP 200, uploaded < 제출 수) 프론트가 이를 확인하지 않고 성공으로
 * 처리하던 문제. 백엔드(FastAPI)가 로컬에서 실행 중이어야 통과한다.
 */
let project: TestProject;
let emptyFilePath: string;

test.beforeAll(async ({ browser }) => {
  const health = await fetch("http://localhost:8000/health").catch(() => null);
  test.skip(!health?.ok, "FastAPI backend(localhost:8000)가 실행 중이지 않아 스킵");

  const page = await browser.newPage();
  await loginAsPhotographer(page);
  project = await createEditingProject(page, 2);
  await page.request.patch(`/api/photographer/projects/${project.projectId}`, {
    data: { max_revision_count: 2 },
  });
  await page.close();

  emptyFilePath = path.join(os.tmpdir(), "E2E_TEST_001.jpg");
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));
});

test.afterAll(async ({ browser }) => {
  if (emptyFilePath) fs.rmSync(emptyFilePath, { force: true });
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("작가 — 보정본 업로드 부분 실패 처리 (BUG-05 회귀)", () => {
  test("빈 파일을 업로드하면 조용히 성공 처리되지 않고 실패가 표시된다", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto(`/photographer/projects/${project.projectId}/workflow`);
    await page.waitForLoadState("networkidle");

    const v1Tab = page.getByRole("button", { name: /^V1/i }).first();
    await expect(v1Tab).toBeVisible({ timeout: 8000 });
    await v1Tab.click();

    const openPanelBtn = page
      .getByRole("button", { name: /보정본 업로드|V1 업로드|업로드 시작|보정 시작/i })
      .first();
    await expect(openPanelBtn).toBeVisible({ timeout: 8000 });
    await openPanelBtn.click();

    const fileInput = page.locator('input[type="file"][multiple]');
    await fileInput.setInputFiles(emptyFilePath);

    const uploadBtn = page.getByRole("button", { name: /^업로드$/i });
    await expect(uploadBtn).toBeEnabled({ timeout: 8000 });
    await uploadBtn.click();

    // 서버가 0바이트 파일을 스킵해 uploaded 수가 제출 수보다 적으면,
    // 패널이 조용히 닫히지 않고 명시적인 실패 메시지가 표시되어야 한다.
    await expect(
      page.getByText(/업로드되지 않았습니다|처리된 파일이 없습니다/)
    ).toBeVisible({ timeout: 20000 });
    // 실패했으므로 패널이 닫히지 않고 업로드 버튼도 그대로 남아있어야 한다.
    await expect(uploadBtn).toBeVisible();
  });
});
