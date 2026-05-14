import type { Page } from "@playwright/test";
import { loginAsPhotographer } from "./auth";

export interface TestProject {
  projectId: string;
  accessToken: string;
  uploadUrl: string;
  galleryUrl: string;
  photoCount?: number;
  requiredCount?: number;
}

/** 기본 프로젝트 생성 (preparing, 사진 없음) — 업로드 테스트용 */
export async function createTestProject(page: Page): Promise<TestProject> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "create_project" },
  });
  if (!res.ok()) throw new Error(`createTestProject failed (${res.status()}): ${await res.text()}`);
  const { projectId, accessToken } = await res.json() as { projectId: string; accessToken: string };
  return { projectId, accessToken, uploadUrl: `/photographer/projects/${projectId}/upload`, galleryUrl: `/c/${accessToken}/gallery` };
}

/**
 * 완전한 고객용 프로젝트 생성 (사진 5장 + selecting 상태).
 * 갤러리·뷰어·검토 테스트에 사용.
 */
export async function createFullProject(page: Page, photoCount = 5): Promise<TestProject> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "create_full_project", photoCount },
  });
  if (!res.ok()) throw new Error(`createFullProject failed (${res.status()}): ${await res.text()}`);
  const data = await res.json() as { projectId: string; accessToken: string; photoCount: number; requiredCount: number };
  return {
    projectId: data.projectId,
    accessToken: data.accessToken,
    uploadUrl: `/photographer/projects/${data.projectId}/upload`,
    galleryUrl: `/c/${data.accessToken}/gallery`,
    photoCount: data.photoCount,
    requiredCount: data.requiredCount,
  };
}

/** 테스트 프로젝트 삭제 (사진·선택 포함) */
export async function deleteTestProject(page: Page, projectId: string): Promise<void> {
  await page.request.delete("/api/auth/test-setup", { data: { projectId } });
}

/** 로그인 + 기본 프로젝트 생성 (업로드용) */
export async function setupTestProject(page: Page): Promise<TestProject> {
  await loginAsPhotographer(page);
  return createTestProject(page);
}

/** 로그인 + 완전한 프로젝트 생성 (고객 갤러리용) */
export async function setupFullProject(page: Page, photoCount = 5): Promise<TestProject> {
  await loginAsPhotographer(page);
  return createFullProject(page, photoCount);
}
