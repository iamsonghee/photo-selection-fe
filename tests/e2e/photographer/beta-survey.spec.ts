import { test, expect, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import {
  getFirstProjectStatus,
  getSecondProjectStatus,
  setProjectStatus,
  resetBetaSurvey,
  backdateSurveyLater,
  deleteTestProject,
  insertProjectLog,
  skipBetaSurvey,
} from "../../helpers/setup";

const SURVEY_TYPE = "first_delivery";
const MODAL_TITLE = "첫 프로젝트를 완료하셨네요";

// PhotographerModal은 모바일/데스크톱 다이얼로그를 동시에 렌더하고 CSS(md:hidden)로만
// 하나를 숨긴다 — 텍스트/버튼 로케이터를 무조건 role="dialog":visible로 좁혀서 strict-mode
// 중복 매칭(두 다이얼로그 모두 DOM엔 존재)을 피한다.
function visibleDialog(page: Page) {
  return page.locator('[role="dialog"]:visible');
}

let projectId: string | null = null;
let originalStatus: string | null = null;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  const first = await getFirstProjectStatus(page);
  projectId = first.projectId;
  originalStatus = first.status;
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!projectId || !originalStatus) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await setProjectStatus(page, projectId, originalStatus);
  await resetBetaSurvey(page, SURVEY_TYPE);
  // 마이크로 설문 3종(생성 후/원본 업로드 후/셀렉 회신받았을 때)은 first_delivery와 달리
  // 트리거 조건을 "복원"할 방법이 없다(프로젝트 존재/업로드·확정 로그는 되돌릴 수 없는
  // 사실이라 원래 status로 되돌리는 것만으로는 재트리거를 막지 못함) — reset(삭제)하면
  // 다음 대시보드 방문(다른 e2e 스펙 포함)에서 다시 노출돼 클릭을 가로챈다. 그래서 삭제
  // 대신 영구 skip으로 남겨 다른 테스트에 영향이 없게 한다.
  await skipBetaSurvey(page, "project_created");
  await skipBetaSurvey(page, "original_uploaded");
  await skipBetaSurvey(page, "selection_received");
  await page.close();
});

test.describe("작가 — 베타 설문(② 첫 프로젝트 납품 완료 후)", () => {
  test.beforeEach(async ({ page }) => {
    if (!projectId) test.skip(true, "테스트 계정에 프로젝트가 없음");
    await loginAsPhotographer(page);
    await resetBetaSurvey(page, SURVEY_TYPE);
    // 마이크로 설문 3종이 우선순위상 first_delivery보다 앞서 있고, 이 계정의 첫
    // 프로젝트엔 실사용 이력(uploaded/confirmed 로그)이 이미 있을 수 있어 억제해둔다.
    await skipBetaSurvey(page, "project_created");
    await skipBetaSurvey(page, "original_uploaded");
    await skipBetaSurvey(page, "selection_received");
  });

  test("BS1: 첫 프로젝트가 delivered 아니면 모달 미노출", async ({ page }) => {
    await setProjectStatus(page, projectId!, "editing");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE)).not.toBeVisible({ timeout: 5000 });
  });

  test("BS2: delivered로 바뀌면 모달 노출 + 문항 렌더", async ({ page }) => {
    await setProjectStatus(page, projectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("실제 고객에게 사용하셨나요?")).toBeVisible();
    await expect(dialog.getByText("작업 시간이 얼마나 줄었다고 느끼셨나요?")).toBeVisible();
    await expect(dialog.getByText("가장 도움이 되었던 기능은 무엇인가요?")).toBeVisible();
    await expect(dialog.getByText("가장 불편했던 점은 무엇이었나요?")).toBeVisible();
    await expect(dialog.getByText("다음 프로젝트에서도 A-CUT을 사용할 계획이 있으신가요?")).toBeVisible();
  });

  test("BS3: '나중에' → 즉시 재방문 시 미노출 → 쿨다운 경과 후 재노출", async ({ page }) => {
    await setProjectStatus(page, projectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    let dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole("button", { name: "나중에" }).click();
    await expect(dialog.getByText(MODAL_TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE)).not.toBeVisible({ timeout: 5000 });

    await backdateSurveyLater(page, SURVEY_TYPE);
    await page.reload();
    await page.waitForLoadState("networkidle");
    dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10_000 });
  });

  test("BS4: 영구 건너뛰기 버튼은 노출하지 않는다", async ({ page }) => {
    await setProjectStatus(page, projectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole("button", { name: "다시 묻지 않기" })).not.toBeVisible();
  });

  test("BS5: 문항 응답 후 제출 → 감사 메시지 → 영구 미노출", async ({ page }) => {
    await setProjectStatus(page, projectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole("button", { name: "예", exact: true }).click();
    await dialog.getByRole("button", { name: "많이 줄었다", exact: true }).click();
    await dialog.getByRole("button", { name: "기타", exact: true }).click();
    await dialog.getByPlaceholder("어떤 기능이었나요?").fill("사진 뷰어");
    await dialog.getByPlaceholder("선택 입력").fill("업로드가 조금 느렸어요");
    await dialog.getByRole("button", { name: "그렇다", exact: true }).click();
    await dialog.getByRole("button", { name: "제출", exact: true }).click();

    await expect(dialog.getByText("소중한 의견 감사합니다")).toBeVisible({ timeout: 10_000 });
    // "닫기"는 모달 헤더의 X 버튼(aria-label="닫기")과도 접근성 이름이 겹친다 —
    // DOM 순서상 감사 화면의 닫기 버튼이 항상 뒤에 온다(header → children).
    await dialog.getByRole("button", { name: "닫기" }).last().click();
    await expect(dialog.getByText(MODAL_TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE)).not.toBeVisible({ timeout: 5000 });
  });

  test("BS6: 인증 없이 세 엔드포인트 호출 시 401", async ({ page, context }) => {
    await context.clearCookies();
    const statusRes = await page.request.get("/api/photographer/beta-survey/status");
    expect(statusRes.status()).toBe(401);
    const submitRes = await page.request.post("/api/photographer/beta-survey", {
      data: { surveyType: SURVEY_TYPE, action: "later" },
    });
    expect(submitRes.status()).toBe(401);
    const skipRes = await page.request.post("/api/photographer/beta-survey/skip", {
      data: { surveyType: SURVEY_TYPE },
    });
    expect(skipRes.status()).toBe(401);
  });
});

const SURVEY_TYPE_2 = "second_delivery";
const MODAL_TITLE_2 = "두 번째 프로젝트도 완료하셨네요";

let secondProjectId: string | null = null;
let secondOriginalStatus: string | null = null;
let secondProjectCreated = false;

test.describe("작가 — 베타 설문(③ 두 번째 프로젝트 납품 완료 후)", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsPhotographer(page);
    const second = await getSecondProjectStatus(page);
    secondProjectId = second.projectId;
    secondOriginalStatus = second.status;
    secondProjectCreated = second.created;
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!secondProjectId) return;
    const page = await browser.newPage();
    await loginAsPhotographer(page);
    if (secondProjectCreated) {
      await deleteTestProject(page, secondProjectId);
    } else if (secondOriginalStatus) {
      await setProjectStatus(page, secondProjectId, secondOriginalStatus);
    }
    await resetBetaSurvey(page, SURVEY_TYPE_2);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    if (!secondProjectId) test.skip(true, "테스트 계정에 두 번째 프로젝트를 준비할 수 없음");
    await loginAsPhotographer(page);
    await resetBetaSurvey(page, SURVEY_TYPE_2);
    // 마이크로 설문 3종과 ②설문이 우선순위상 ③보다 앞서 있어, 남아있으면(또는 이
    // 계정의 첫 프로젝트에 실사용 이력이 있으면) 상태 확인 루프에서 먼저 걸려 ③이
    // 노출되지 않을 수 있다 — 이 describe 블록은 ③만 검증하므로 전부 영구 억제해둔다.
    await skipBetaSurvey(page, "project_created");
    await skipBetaSurvey(page, "original_uploaded");
    await skipBetaSurvey(page, "selection_received");
    await skipBetaSurvey(page, "first_delivery");
  });

  test("CS1: 두 번째 프로젝트가 delivered 아니면 모달 미노출", async ({ page }) => {
    await setProjectStatus(page, secondProjectId!, "editing");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE_2)).not.toBeVisible({ timeout: 5000 });
  });

  test("CS2: delivered로 바뀌면 모달 노출 + 문항 렌더", async ({ page }) => {
    await setProjectStatus(page, secondProjectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE_2)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("앞으로도 A-CUT을 계속 사용할 의향이 있으신가요?")).toBeVisible();
    await expect(dialog.getByText("동료 작가에게 추천할 가능성은 얼마나 되나요?")).toBeVisible();
    await expect(dialog.getByText("A-CUT이 없어진다면 얼마나 아쉬울 것 같나요?")).toBeVisible();
    await expect(dialog.getByText("적정한 월 이용료는 얼마라고 생각하시나요?")).toBeVisible();
    await expect(dialog.getByText("유료로 출시되어도 계속 사용할 의향이 있으신가요?")).toBeVisible();
    await expect(dialog.getByText("가장 추가되었으면 하는 기능이 있다면?")).toBeVisible();
    await expect(dialog.getByText("기타 의견")).toBeVisible();
    await expect(dialog.getByText("정식 출시 시 먼저 안내받고 싶으신가요?")).toBeVisible();
  });

  test("CS3: '나중에' → 즉시 재방문 시 미노출 → 쿨다운 경과 후 재노출", async ({ page }) => {
    await setProjectStatus(page, secondProjectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    let dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE_2)).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole("button", { name: "나중에" }).click();
    await expect(dialog.getByText(MODAL_TITLE_2)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE_2)).not.toBeVisible({ timeout: 5000 });

    await backdateSurveyLater(page, SURVEY_TYPE_2);
    await page.reload();
    await page.waitForLoadState("networkidle");
    dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE_2)).toBeVisible({ timeout: 10_000 });
  });

  test("CS4: 영구 건너뛰기 버튼은 노출하지 않는다", async ({ page }) => {
    await setProjectStatus(page, secondProjectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE_2)).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole("button", { name: "다시 묻지 않기" })).not.toBeVisible();
  });

  test("CS5: 문항 응답(NPS·가격 구간·체크박스 포함) 후 제출 → 감사 메시지 → 영구 미노출", async ({ page }) => {
    await setProjectStatus(page, secondProjectId!, "delivered");
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(MODAL_TITLE_2)).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole("button", { name: "매우 그렇다", exact: true }).first().click(); // continueUsingIntent
    await dialog.getByRole("button", { name: "9", exact: true }).click(); // npsScore
    await dialog.getByRole("button", { name: "매우 아쉽다", exact: true }).click(); // painIfGone
    await dialog.getByRole("button", { name: "1만원~3만원", exact: true }).click(); // priceRange
    await dialog.getByRole("button", { name: "매우 그렇다", exact: true }).last().click(); // subscribeIntentIfPaid
    const freeTextAreas = dialog.getByPlaceholder("선택 입력");
    await freeTextAreas.nth(0).fill("사진 뷰어 개선"); // desiredFeature
    await freeTextAreas.nth(1).fill("전체적으로 만족합니다"); // otherFeedback
    await dialog.getByRole("checkbox").check(); // wantsLaunchNotice
    await dialog.getByRole("button", { name: "제출", exact: true }).click();

    await expect(dialog.getByText("소중한 의견 감사합니다")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "닫기" }).last().click();
    await expect(dialog.getByText(MODAL_TITLE_2)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(MODAL_TITLE_2)).not.toBeVisible({ timeout: 5000 });
  });
});

// ── 마이크로 설문 3종(첫 프로젝트 진행 중) ───────────────────────────────────
// 이 계정의 첫 프로젝트는 이미 실사용/QA 이력이 쌓여 있어 project_logs에 uploaded/
// confirmed 이벤트가 이미 존재할 수 있다(append-only라 지울 수 없음) — 그래서
// "트리거 미충족 → 미노출" 부정 케이스는 project_created/original_uploaded/
// selection_received에 대해서는 안전하게 재현할 수 없어 검증하지 않는다(②③의
// BS1/CS1과 다른 점). 대신 "충족 → 노출 → 응답 처리" 흐름만 검증한다.

test.describe("작가 — 베타 설문(생성 후 마이크로 설문)", () => {
  const TYPE = "project_created";
  const TITLE = "프로젝트를 만드셨네요";

  test.beforeEach(async ({ page }) => {
    if (!projectId) test.skip(true, "테스트 계정에 프로젝트가 없음");
    await loginAsPhotographer(page);
    await resetBetaSurvey(page, TYPE);
  });

  test("PS1: 노출 + 문항 렌더 + 제출 → 감사 메시지 → 영구 미노출", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("프로젝트 생성 과정, 어렵지 않으셨나요?")).toBeVisible();

    await dialog.getByRole("button", { name: "아주 수월했다", exact: true }).click();
    await dialog.getByRole("button", { name: "제출", exact: true }).click();

    await expect(dialog.getByText("소중한 의견 감사합니다")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "닫기" }).last().click();
    await expect(dialog.getByText(TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(TITLE)).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("작가 — 베타 설문(원본 업로드 후 마이크로 설문)", () => {
  const TYPE = "original_uploaded";
  const TITLE = "원본 업로드를 완료하셨네요";

  test.beforeEach(async ({ page }) => {
    if (!projectId) test.skip(true, "테스트 계정에 프로젝트가 없음");
    await loginAsPhotographer(page);
    await resetBetaSurvey(page, TYPE);
    await skipBetaSurvey(page, "project_created"); // 우선순위상 더 앞선 타입을 억제
    await insertProjectLog(page, projectId!, "uploaded");
  });

  test("US1: 노출 + 문항 렌더 + 제출 → 감사 메시지 → 영구 미노출", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("원본 사진 업로드 과정이 수월하셨나요?")).toBeVisible();
    await expect(dialog.getByText("혹시 불편했던 점이 있다면 알려주세요")).toBeVisible();

    await dialog.getByRole("button", { name: "수월했다", exact: true }).click();
    await dialog.getByPlaceholder("선택 입력").fill("배치 업로드가 조금 느렸어요");
    await dialog.getByRole("button", { name: "제출", exact: true }).click();

    await expect(dialog.getByText("소중한 의견 감사합니다")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "닫기" }).last().click();
    await expect(dialog.getByText(TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(TITLE)).not.toBeVisible({ timeout: 5000 });
  });

  test("US2: '나중에' → 즉시 재방문 시 미노출 → 쿨다운 경과 후 재노출", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole("button", { name: "나중에" }).click();
    await expect(dialog.getByText(TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(TITLE)).not.toBeVisible({ timeout: 5000 });

    await backdateSurveyLater(page, TYPE);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(visibleDialog(page).getByText(TITLE)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("작가 — 베타 설문(셀렉 회신받았을 때 마이크로 설문)", () => {
  const TYPE = "selection_received";
  const TITLE = "고객이 셀렉을 완료했어요";

  test.beforeEach(async ({ page }) => {
    if (!projectId) test.skip(true, "테스트 계정에 프로젝트가 없음");
    await loginAsPhotographer(page);
    await resetBetaSurvey(page, TYPE);
    await skipBetaSurvey(page, "project_created");
    await skipBetaSurvey(page, "original_uploaded"); // 우선순위상 더 앞선 타입들을 억제
    await insertProjectLog(page, projectId!, "confirmed");
  });

  test("SS1: 노출 + 문항 렌더 + 제출 → 감사 메시지 → 영구 미노출", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("고객의 셀렉 결과를 확인하는 과정이 편리했나요?")).toBeVisible();
    await expect(dialog.getByText("고객에게 들은 의견이나 불편사항이 있다면 알려주세요")).toBeVisible();

    await dialog.getByRole("button", { name: "아주 수월했다", exact: true }).click();
    await dialog.getByPlaceholder("선택 입력").fill("고객이 만족스러워했어요");
    await dialog.getByRole("button", { name: "제출", exact: true }).click();

    await expect(dialog.getByText("소중한 의견 감사합니다")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "닫기" }).last().click();
    await expect(dialog.getByText(TITLE)).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(TITLE)).not.toBeVisible({ timeout: 5000 });
  });

  test("SS2: 영구 건너뛰기 버튼은 노출하지 않는다", async ({ page }) => {
    await page.goto("/photographer/dashboard");
    await page.waitForLoadState("networkidle");
    const dialog = visibleDialog(page);
    await expect(dialog.getByText(TITLE)).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole("button", { name: "다시 묻지 않기" })).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(TITLE)).not.toBeVisible({ timeout: 5000 });
  });
});
