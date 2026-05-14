import type { Page } from "@playwright/test";
import { loginAsPhotographer } from "./auth";

export interface TestProject {
  projectId: string;
  accessToken: string;
  uploadUrl: string;
  galleryUrl: string;
}

/**
 * 테스트용 프로젝트 생성 (API 직접 호출).
 * loginAsPhotographer() 호출 후 사용하세요.
 */
export async function createTestProject(page: Page): Promise<TestProject> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "create_project" },
  });
  if (!res.ok()) {
    throw new Error(`createTestProject failed (${res.status()}): ${await res.text()}`);
  }
  const { projectId, accessToken } = await res.json() as { projectId: string; accessToken: string };
  return {
    projectId,
    accessToken,
    uploadUrl: `/photographer/projects/${projectId}/upload`,
    galleryUrl: `/c/${accessToken}/gallery`,
  };
}

/**
 * 테스트 프로젝트 삭제 (photos 포함).
 */
export async function deleteTestProject(page: Page, projectId: string): Promise<void> {
  await page.request.delete("/api/auth/test-setup", {
    data: { projectId },
  });
}

/**
 * 로그인 + 테스트 프로젝트 생성을 한 번에.
 * test.beforeAll에서 사용하세요.
 */
export async function setupTestProject(page: Page): Promise<TestProject> {
  await loginAsPhotographer(page);
  return createTestProject(page);
}
