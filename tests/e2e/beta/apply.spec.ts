import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test.describe("클로즈드 베타 신청", () => {
  test("비로그인 사용자는 로그인 안내를 보고 제출 API는 401을 반환한다", async ({ page }) => {
    await page.goto("/beta/apply");

    await expect(page.getByRole("heading", { name: "A-CUT 클로즈드 베타 신청" })).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인하고 신청하기" })).toBeVisible();

    const response = await page.request.post("/api/beta/applications", { data: {} });
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "로그인이 필요합니다." });
  });

  test("로그인 사용자는 필수값과 휴대폰번호 오류를 안내받는다", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/beta/apply");

    await page.getByRole("button", { name: "베타 신청하기" }).click();
    await expect(page.getByText("이름을 입력해주세요.")).toBeVisible();

    await page.getByLabel("이름 *").fill("베타 테스트");
    await page.getByLabel("휴대폰번호 *").fill("010-123-4567");
    await page.getByRole("button", { name: "베타 신청하기" }).click();
    await expect(page.getByText("휴대폰번호 형식이 올바르지 않습니다. (예: 010-1234-5678)")).toBeVisible();
  });

  test("선택 입력은 한 번 고른 뒤 다시 미선택으로 되돌릴 수 있다", async ({ page }) => {
    await loginAsPhotographer(page);
    await page.goto("/beta/apply");

    const painPoint = page.getByLabel("가장 불편한 단계");
    await painPoint.selectOption("customer_selection");
    await expect(painPoint).toHaveValue("customer_selection");
    await painPoint.selectOption("");
    await expect(painPoint).toHaveValue("");
  });

  test("기타 선택을 해제하면 숨겨진 기타 답변을 제출하지 않는다", async ({ page }) => {
    await loginAsPhotographer(page);

    let submittedBody: Record<string, unknown> | null = null;
    await page.route("**/api/beta/applications", async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/beta/apply");
    await page.getByLabel("이름 *").fill("베타 테스트");
    await page.getByLabel("휴대폰번호 *").fill("010-9876-5432");

    const genreGroup = page.getByRole("group", { name: "주 촬영 분야 * (복수선택 가능)" });
    await genreGroup.getByRole("button", { name: "기타" }).click();
    await genreGroup.getByPlaceholder("기타 내용을 입력해주세요").fill("숨겨지면 안 되는 값");
    await genreGroup.getByRole("button", { name: "기타" }).click();
    await genreGroup.getByRole("button", { name: "웨딩 본식" }).click();

    await page.getByLabel("월평균 촬영 수 *").selectOption("1_3");
    await page.getByLabel("촬영당 평균 사진 수 *").selectOption("under_500");
    await page.getByRole("group", { name: "현재 고객 셀렉 방식은 어떻게 진행하시나요? * (복수선택 가능)" })
      .getByRole("button", { name: "이메일" })
      .click();
    await page.getByRole("group", { name: "베타에서 사용해보고 싶은 기능은? * (복수선택 가능)" })
      .getByRole("button", { name: "고객 셀렉 갤러리" })
      .click();
    await page.getByLabel("개인정보 수집·이용에 동의합니다 (필수)").check();
    await page.getByLabel("베타 운영 관련 연락에 동의합니다 (필수)").check();
    await page.getByRole("button", { name: "베타 신청하기" }).click();

    await expect(page).toHaveURL(/\/beta\/apply\/complete$/);
    expect(submittedBody).not.toHaveProperty("genre_other");
  });

  test("모바일 화면에서 신청 폼이 가로로 넘치지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsPhotographer(page);
    await page.goto("/beta/apply");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("정상 입력을 빠르게 연속 제출해도 POST는 한 번만 전송된다", async ({ page }) => {
    await loginAsPhotographer(page);

    let requestCount = 0;
    await page.route("**/api/beta/applications", async (route) => {
      requestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/beta/apply");
    await page.getByLabel("이름 *").fill("베타 테스트");
    await page.getByLabel("휴대폰번호 *").fill("010-9876-5432");
    await page.getByRole("button", { name: "웨딩 본식" }).click();
    await page.getByLabel("월평균 촬영 수 *").selectOption("1_3");
    await page.getByLabel("촬영당 평균 사진 수 *").selectOption("under_500");
    await page.getByRole("group", { name: "현재 고객 셀렉 방식은 어떻게 진행하시나요? * (복수선택 가능)" })
      .getByRole("button", { name: "이메일" })
      .click();
    await page.getByRole("group", { name: "베타에서 사용해보고 싶은 기능은? * (복수선택 가능)" })
      .getByRole("button", { name: "고객 셀렉 갤러리" })
      .click();
    await page.getByLabel("개인정보 수집·이용에 동의합니다 (필수)").check();
    await page.getByLabel("베타 운영 관련 연락에 동의합니다 (필수)").check();

    await page.getByRole("button", { name: "베타 신청하기" }).dblclick();
    await expect(page).toHaveURL(/\/beta\/apply\/complete$/);
    expect(requestCount).toBe(1);
  });
});
