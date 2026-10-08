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
    await page.goto(`/photographer/projects/${project.projectId}/assets/retouched`);
    await page.waitForLoadState("networkidle");

    const uploadDialog = page.getByRole("dialog", { name: "보정본 업로드" });
    await expect(uploadDialog).toBeVisible({ timeout: 8000 });

    const fileInput = uploadDialog.locator('input[type="file"][multiple]');
    await fileInput.setInputFiles(emptyFilePath);

    // 빈 파일은 고르는 순간 이유를 밝히고 제외한다 — 조용히 성공 처리되거나 업로드 대상에 섞이지 않는다.
    await expect(uploadDialog.getByText("내용이 없는 파일 1개를 제외했습니다.")).toBeVisible();
    await expect(uploadDialog.getByRole("button", { name: /^업로드$/i })).toBeDisabled();
  });
});
