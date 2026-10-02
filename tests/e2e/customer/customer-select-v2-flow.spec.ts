import { expect, test } from "@playwright/test";
import path from "path";

test("촬영 유형과 빈 목표로 실제 선택 파일을 끝까지 전달한다", async ({ page }) => {
  await page.goto("/customer-select/new");
  await expect(page.getByRole("textbox", { name: /중요하게 남기고 싶은 사진/ })).toHaveCount(0);
  await page.locator('select[name="shootType"]').selectOption("first_birthday");
  await page.getByRole("button", { name: "사진 올리기" }).click();
  await expect(page).toHaveURL(/\/customer-select\/upload/);
  await page.locator('input[type="file"]').setInputFiles({ name: "DUP.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await page.getByRole("button", { name: "분석 없이 사진 고르기" }).click();
  await expect(page).toHaveURL(/scenes=0&similar=0&quality=0/);
  await page.getByRole("button", { name: "DUP.jpg 크게 보기" }).click();
  await page.getByRole("button", { name: "DUP.jpg 찜" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "DUP.jpg 최종 선택" }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByText("최종 검토 →").click();
  await expect(page.getByText("최종 선택 1장")).toBeVisible();
  await expect(page.getByRole("region", { name: "선택한 사진" })).toBeVisible();
  await expect(page.getByText(/촬영 순서 \d/)).toHaveCount(0);
  await expect(page.locator("main textarea")).toHaveCount(0);
  await expect(page.getByText(/목표보다/)).toHaveCount(0);
  await page.getByRole("button", { name: "결과 만들기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "이 결과를 만들까요?" })).toContainText("작가에게 자동으로 전송되지는 않습니다.");
  await page.getByRole("button", { name: "다시 검토" }).click();
  await expect(page).toHaveURL(/customer-select\/review/);
  await page.getByRole("button", { name: "결과 만들기", exact: true }).click();
  await page.getByRole("button", { name: "결과 만들고 확인하기" }).click();
  await expect(page.getByRole("region", { name: /전달 사진과 요청 사항/ }).getByText("DUP.jpg", { exact: true })).toBeVisible();
  await expect(page.getByText("작가에게 전달해 주세요.")).toBeVisible();
});

test("소유주와 참여자가 같은 사진을 찜하고 소유주만 최종 선택한다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0&scenes=1&similar=1");
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 찜" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택" }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByRole("button", { name: "함께 고르기", exact: true }).click();
  await expect(page).toHaveURL(/\/customer-select\/select/);
  await page.getByRole("textbox", { name: "참여자 이름" }).fill("민준");
  await page.getByRole("button", { name: "참여자 추가" }).click();
  await page.getByRole("button", { name: /민준 · 고르는 중/ }).click();
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기" }).click();
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택" })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 찜" }).click();
  await page.getByRole("button", { name: "사진 2 보기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0002.jpg 찜" }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByRole("button", { name: /함께 고르기 2명/ }).click();
  await page.getByRole("button", { name: "공통 찜" }).click();
  await expect(page.getByRole("button", { name: /공통 찜 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 3장 유사컷 보기" })).toBeVisible();
  await page.getByRole("button", { name: /함께 고르기 2명/ }).click();
  await page.getByRole("button", { name: "의견 차이" }).click();
  await expect(page.getByRole("button", { name: /의견 차이 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "ACUT_1_0002.jpg 3장 유사컷 보기" })).toBeVisible();
});

test("정리 결과와 이전 함께 고르기 주소도 셀렉 갤러리의 참여자 창으로 연다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer-select/results?scenes=1&similar=1");
  await page.getByRole("button", { name: "함께 고르기" }).click();
  await expect(page).toHaveURL(/\/customer-select\/select\?.*collab=1/);
  await expect(page.getByRole("dialog", { name: "함께 고르기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/customer-select-collaboration-mobile.png" });
  await page.goto("/customer-select/together");
  await expect(page).toHaveURL(/\/customer-select\/select\?.*collab=1/);
  await expect(page.getByRole("dialog", { name: "함께 고르기" })).toBeVisible();
});

test("찜 없이 바로 최종 선택할 수 있고 찜 해제는 최종 선택을 바꾸지 않는다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0&scenes=1&similar=0");
  await expect(page.getByRole("button", { name: "여러 장 선택" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /작업 선택/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 찜" })).toHaveCount(0);
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기" }).click();
  const favorite = page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 찜" });
  const final = page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택" });
  await final.click();
  await expect(final).toHaveAttribute("aria-pressed", "true");
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await favorite.click();
  await favorite.click();
  await expect(final).toHaveAttribute("aria-pressed", "true");
});

test("넓은 그리드는 사진별 최종 선택을 바로 바꾸고 좁은 그리드는 상태만 보여준다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer-select/select?scene=0&scenes=1&similar=1");
  await expect(page.locator("[data-photo-card] p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 최종 선택" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ACUT_1_0004.jpg 찜" })).toHaveCount(0);
  await page.getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택" }).click();
  await expect(page.getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /사진 크기 변경 · 현재 2열/ }).click();
  await expect(page.getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택" })).toHaveCount(0);
  await expect(page.getByLabel("최종 선택됨").first()).toBeVisible();
  await page.getByRole("button", { name: "ACUT_1_0004.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "ACUT_1_0004.jpg" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "ACUT_1_0004.jpg 최종 선택" })).toHaveAttribute("aria-pressed", "true");
});

test("5,000장 갤러리는 보이는 카드만 렌더링하고 장면·사진 종류를 고칠 수 있다", async ({ page }) => {
  await page.goto("/customer-select/select?scene=0&scenes=1&similar=0");
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기" })).toBeVisible();
  expect(await page.locator("[data-photo-card]").count()).toBeLessThan(120);
  await page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기" }).click();
  await page.getByText("사진 정보 수정").click();
  await page.getByRole("combobox", { name: "현재 사진 인물" }).selectOption("부모님");
  await page.getByRole("checkbox", { name: "가족·단체사진" }).check();
  await page.getByRole("combobox", { name: "현재 사진 촬영 구간" }).selectOption("1");
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기" })).toHaveCount(0);
  await page.getByRole("button", { name: "전체 장면 열기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /2\. 입장/ }).click();
  await page.getByText("필터", { exact: true }).click();
  await page.getByRole("combobox", { name: "인물" }).selectOption("부모님");
  await page.getByRole("combobox", { name: "사진 종류" }).selectOption("가족·단체사진");
  await expect(page.getByRole("button", { name: "ACUT_1_0001.jpg 크게 보기" })).toBeVisible();
});

test("사진 추가는 기존 찜과 최종 선택을 유지한다", async ({ page }) => {
  await page.goto("/customer-select/new");
  await page.locator('select[name="shootType"]').selectOption("ceremony");
  await page.getByRole("button", { name: "사진 올리기" }).click();
  const fixture = path.resolve("tests/fixtures/sample.jpg");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await page.getByRole("button", { name: "분석 없이 사진 고르기" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "sample.jpg 크게 보기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "sample.jpg 찜" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "sample.jpg 최종 선택" }).click();
  await page.getByRole("button", { name: "상세보기 닫기" }).click();
  await page.getByRole("link", { name: "업로드 화면으로" }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByRole("dialog", { name: "사진을 정리할까요?" })).toHaveCount(0);
  await page.getByRole("button", { name: "사진 고르기 시작" }).click();
  await page.getByRole("button", { name: "분석 없이 사진 고르기" }).click();
  await expect(page.getByText("최종 1", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /찜한 사진만 1/ })).toBeVisible();
});

test("업로드 시안은 서버 전송으로 오해시키지 않고 사진을 크게 볼 수 있다", async ({ page }) => {
  await page.goto("/customer-select/upload");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/sample.jpg"));
  await page.getByRole("button", { name: "사진 준비하기" }).click();
  await expect(page.getByLabel("업로드 다음 단계")).toContainText("서버에 전송하지 않아요");
  await page.getByRole("button", { name: "sample.jpg 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "sample.jpg 크게 보기" })).toBeVisible();
});
