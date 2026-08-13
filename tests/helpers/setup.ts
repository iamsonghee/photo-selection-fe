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

/** editing 상태 프로젝트 생성 (보정본 업로드 테스트용) */
export async function createEditingProject(
  page: Page,
  photoCount = 5,
  includeOriginal = true,
): Promise<TestProject> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "create_editing_project", photoCount, includeOriginal },
  });
  if (!res.ok()) throw new Error(`createEditingProject failed (${res.status()}): ${await res.text()}`);
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

/** 프로젝트에 4자리 PIN 설정 (로그인된 작가 세션 필요) */
export async function setProjectPin(page: Page, projectId: string, pin: string): Promise<void> {
  const res = await page.request.patch(`/api/photographer/projects/${projectId}`, {
    data: { access_pin: pin },
  });
  if (!res.ok()) throw new Error(`setProjectPin failed (${res.status()}): ${await res.text()}`);
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

/**
 * 고객 갤러리 E2E용 썸네일 presign 응답.
 *
 * 실제 갤러리는 R2 객체 키에서 발급한 단기 URL만 렌더링한다. 테스트 픽스처는 R2에
 * 업로드하지 않는 공개 더미 URL을 쓰므로, 이 경계만 모킹해 갤러리 UI와 선택 흐름을
 * 실제와 동일하게 검증한다.
 */
export async function mockCustomerThumbPresigning(page: Page): Promise<void> {
  await page.route("**/api/c/presign-thumbs?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const photoIds = (requestUrl.searchParams.get("photoIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const expiresAt = Date.now() + 60_000;
    const presignedUrls = Object.fromEntries(
      photoIds.map((id) => [
        id,
        { url: `https://picsum.photos/seed/e2e-${encodeURIComponent(id)}/400/400`, expiresAt },
      ])
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ presignedUrls }),
    });
  });
}

// ── 베타 설문(5단계, plan/beta-system.md §7) E2E 헬퍼 ──────────────────────

/** 로그인한 작가의 첫 생성 프로젝트 id/status 조회(② 설문 트리거 확인용) */
export async function getFirstProjectStatus(page: Page): Promise<{ projectId: string | null; status: string | null }> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "first_project_status" },
  });
  if (!res.ok()) throw new Error(`getFirstProjectStatus failed (${res.status()}): ${await res.text()}`);
  return res.json();
}

/**
 * 로그인한 작가의 생성 순서 기준 두 번째 프로젝트 id/status 조회(③ 설문 트리거 확인용).
 * 두 번째 프로젝트가 없으면 테스트용으로 하나 새로 생성한다 — `created:true`면
 * 테스트 종료 후 `deleteTestProject`로 정리해야 한다(계정에 영구히 남지 않도록).
 */
export async function getSecondProjectStatus(
  page: Page
): Promise<{ projectId: string; status: string; created: boolean }> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "second_project_status" },
  });
  if (!res.ok()) throw new Error(`getSecondProjectStatus failed (${res.status()}): ${await res.text()}`);
  return res.json();
}

/** 프로젝트 status 직접 변경(실제 워크플로우 없이 delivered 등으로 강제 전환) */
export async function setProjectStatus(page: Page, projectId: string, status: string): Promise<void> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "set_project_status", projectId, status },
  });
  if (!res.ok()) throw new Error(`setProjectStatus failed (${res.status()}): ${await res.text()}`);
}

/** beta_survey_responses 행 삭제(테스트 케이스 간 노출 상태 초기화) */
export async function resetBetaSurvey(page: Page, surveyType: string): Promise<void> {
  await page.request.post("/api/auth/test-setup", { data: { action: "reset_beta_survey", surveyType } });
}

/** "나중에" 24시간 쿨다운을 과거로 당겨 재노출 조건을 즉시 통과시킴 */
export async function backdateSurveyLater(page: Page, surveyType: string): Promise<void> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "backdate_survey_later", surveyType },
  });
  if (!res.ok()) throw new Error(`backdateSurveyLater failed (${res.status()}): ${await res.text()}`);
}

/**
 * project_logs에 이벤트를 직접 삽입(실제 업로드/셀렉 확정 플로우를 거치지 않고
 * 원본 업로드 후/셀렉 회신받았을 때 마이크로 설문 트리거를 테스트하기 위함).
 */
export async function insertProjectLog(page: Page, projectId: string, logAction: string): Promise<void> {
  const res = await page.request.post("/api/auth/test-setup", {
    data: { action: "insert_project_log", projectId, logAction },
  });
  if (!res.ok()) throw new Error(`insertProjectLog failed (${res.status()}): ${await res.text()}`);
}

/** 설문 "다시 묻지 않기"(영구 건너뛰기) — 다른 survey_type을 미리 억제해 특정 타입만 노출시킬 때 사용 */
export async function skipBetaSurvey(page: Page, surveyType: string): Promise<void> {
  await page.request.post("/api/photographer/beta-survey/skip", { data: { surveyType } });
}
