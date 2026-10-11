import { test, expect as baseExpect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsPhotographer } from "../helpers/auth";

const expect = baseExpect.configure({ timeout: 15000 });

test("세 랜딩과 명시적 로그인 목적지 · 모바일 표시", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("사진을 고르고");
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "스튜디오 알아보기", exact: true }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await page.getByRole("link", { name: "고객 프로젝트 시작하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("next")).toBe("/photographer/dashboard");
    await page.getByRole("button", { name: "로그인 닫기" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto("/select");
    await page.getByRole("link", { name: "내 사진 셀렉 시작하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("next")).toBe("/customer-select");
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("보호된 주소와 기존 로그인 링크의 복귀 목적지 보존", async ({ request, page }) => {
  for (const destination of ["/photographer/projects?status=active", "/customer-select/new/photos", "/customer-select/guest/example/download", "/customer-select/example/settings"]) {
    const result = await request.get(destination, { maxRedirects: 0 });
    expect(result.status()).toBe(307);
    const login = new URL(result.headers().location, result.url());
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe(destination);
  }
  await page.goto("/customer-select/login");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer-select$/);
});

test("공통 로그인은 공간 선택으로, OAuth 실패는 목적지를 유지하며 재시도", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.route("**/auth/v1/authorize**", (route) => route.abort());
  await page.getByRole("button", { name: "Google로 시작하기" }).click();
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "acut_post_login_redirect")?.value).toBe(encodeURIComponent("/workspaces"));
  const failure = await request.get("/auth/callback?next=%2Fcustomer-select", { maxRedirects: 0 });
  const retry = new URL(failure.headers().location, failure.url());
  expect(retry.pathname).toBe("/login");
  expect(retry.searchParams.get("error")).toBe("oauth");
  await page.goto("/login?error=oauth&next=%2Fcustomer-select");
  await expect(page.getByRole("alert")).toContainText("다시 시도");
  await page.getByRole("button", { name: "로그인하고 계속하기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("같은 계정의 공간 선택·전환·재로그인, 저장 실패 시 작업 유지", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.TEST_PHOTOGRAPHER_EMAIL || !process.env.SUPABASE_SERVICE_ROLE_KEY, "설정된 테스트 계정 필요");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { userId } = await loginAsPhotographer(page);
  const original = await admin.auth.admin.getUserById(userId);
  if (original.error) throw original.error;
  const previous = original.data.user.user_metadata.acut_last_workspace ?? null;
  const quotaBefore = await (await page.request.get("/api/photographer/quota")).json();
  const setSpace = async (value: string | null) => {
    const result = await admin.auth.admin.updateUserById(userId, { user_metadata: { acut_last_workspace: value } });
    if (result.error) throw result.error;
  };
  const storedSpace = async () => (await admin.auth.admin.getUserById(userId)).data.user?.user_metadata.acut_last_workspace;
  try {
    await setSpace(null);
    await page.goto("/workspaces");
    await expect(page.getByRole("heading", { name: "어떤 작업을 시작할까요?" })).toBeVisible();
    await page.getByRole("link", { name: "내 사진 셀렉 시작하기", exact: true }).click();
    await expect(page).toHaveURL(/\/customer-select$/);
    await expect.poll(storedSpace).toBe("select");
    await page.getByLabel("계정 메뉴", { exact: true }).click();
    await page.getByRole("link", { name: "스튜디오로 이동" }).click();
    await expect(page).toHaveURL(/\/photographer\/dashboard$/);
    await expect.poll(storedSpace).toBe("studio");
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/photographer/projects");
    await expect(page.getByRole("link", { name: "내 사진 셀렉으로 이동", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name: "내 사진 셀렉으로 이동", exact: true }).click();
    await expect(page).toHaveURL(/\/customer-select$/);
    await page.setViewportSize({ width: 1280, height: 850 });
    await setSpace("studio");
    await page.goto("/select");
    await page.getByRole("link", { name: "내 사진 셀렉 시작하기", exact: true }).click();
    await expect(page).toHaveURL(/\/customer-select$/);
    await expect.poll(storedSpace).toBe("select");
    await page.getByLabel("계정 메뉴", { exact: true }).click();
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page).toHaveURL(/\/select$/);
    await loginAsPhotographer(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/customer-select$/);
    await page.context().addCookies([{ name: "acut_workspace_save_failed_another-user", value: "1", url: new URL(page.url()).origin }]);
    await page.goto("/workspaces");
    await expect(page).toHaveURL(/\/customer-select$/);
    const quotaAfter = await (await page.request.get("/api/photographer/quota")).json();
    expect(quotaAfter).toEqual(quotaBefore);
    await setSpace("studio");
    await page.route("**/auth/v1/user", async (route) => {
      if (route.request().method() === "PUT") return route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"test unavailable"}' });
      await route.continue();
    });
    await page.goto("/customer-select");
    await expect(page.getByRole("status")).toContainText("마지막 사용 공간을 저장하지 못했어요");
    await expect(page).toHaveURL(/\/customer-select$/);
    await page.goto("/workspaces");
    await expect(page.getByRole("heading", { name: "어떤 작업을 시작할까요?" })).toBeVisible();
  } finally {
    await page.close();
    await setSpace(previous);
  }
});
