import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Opt-in only: local Postgres/PostgREST, fake authentication and disk R2. Never use production .env.
test.skip(process.env.GUEST_LOCAL_E2E !== "1", "Requires tests/support/guest_local_server.py and disposable local DB");
const backend = "http://127.0.0.1:55441";
const origin = "http://localhost:3107";
const owner = "11111111-1111-4111-8111-111111111111";
async function login(context: BrowserContext, id = owner) {
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = `${encode({ alg: "HS256" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await context.addCookies([{ name: "sb-127-auth-token", value: `base64-${encode({ access_token: token, refresh_token: "test", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id } })}`, url: origin }]);
}

test("upload → close → saved selection on second device → ZIP → expiration cleanup", async ({ page, context, browser, request }) => {
  test.setTimeout(180000);
  const album = randomUUID();
  const token = randomUUID().replaceAll("-", "");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() - 2 * 86400000));
  expect((await request.post(`${backend}/rest/v1/guest_albums`, { data: { id: album, owner_id: owner, name: "하객 테스트 앨범", wedding_date: today, upload_token: token } })).ok()).toBeTruthy();
  await page.goto(`${origin}/g/${token}`);
  await page.getByPlaceholder("예: 신부 대학 친구 민지").fill("테스트 하객");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "guest.png", mimeType: "image/png", buffer: png });
  let failPut = true;
  await page.route("**/storage/**/original?*", async (route) => {
    if (failPut) { failPut = false; await route.abort("failed"); } else await route.continue();
  });
  await page.getByRole("button", { name: /보내기/ }).last().click();
  await expect(page.getByRole("button", { name: "실패한 1개 다시 보내기" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "실패한 1개 다시 보내기" }).click();
  await expect(page.getByText("테스트 하객님, 보내 주셔서 고마워요")).toBeVisible({ timeout: 60000 });
  await page.getByRole("link", { name: "내가 보낸 사진" }).click();
  await expect(page.getByText("사진 1장", { exact: true })).toBeVisible();
  await login(context);
  await page.goto(`${origin}/customer-select/guest/${album}`);
  await expect(page.getByLabel("결혼식 날짜")).toBeDisabled();
  await page.getByRole("button", { name: "셀렉 시작", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /셀렉 시작/ }).click();
  await expect(page).toHaveURL(/\/select$/);
  await page.getByRole("button", { name: "guest.png 선택", exact: true }).click();
  await expect(page.getByText("고른 결과를 저장했어요.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "guest.png 선택 해제" })).toHaveAttribute("aria-pressed", "true");
  const second = await browser.newContext();
  await login(second);
  const otherPage = await second.newPage();
  await otherPage.goto(`${origin}/customer-select/guest/${album}/select`);
  await expect(otherPage.getByRole("button", { name: "guest.png 선택 해제" })).toHaveAttribute("aria-pressed", "true");
  await second.close();
  await page.getByRole("link", { name: "선택본 다운로드" }).click();
  await page.getByRole("button", { name: "현재 선택으로 ZIP 만들기" }).click();
  await expect(page.getByRole("link", { name: "파트 1 내려받기" })).toBeVisible({ timeout: 60000 });
  const url = await page.getByRole("link", { name: "파트 1 내려받기" }).getAttribute("href");
  const zip = await request.get(url!);
  expect(zip.ok()).toBeTruthy();
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
  await page.screenshot({ path: "/tmp/guest-download-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/guest-download-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const stranger = await browser.newContext();
  await login(stranger, "99999999-9999-4999-8999-999999999999");
  const denied = await stranger.request.delete(`${origin}/api/customer-select/guest-albums/${album}`);
  expect(denied.status()).toBe(404);
  await stranger.close();
  // Expire the uploaded album using the real policy, keeping the locked wedding date intact.
  expect((await request.patch(`${backend}/rest/v1/app_settings?id=eq.1`, { data: { guest_retention_days: 1 } })).ok()).toBeTruthy();
  try {
    await request.post(`${backend}/_test/sweep`);
    const expiredRow = await (await request.get(`${backend}/rest/v1/guest_albums?id=eq.${album}`)).json();
    expect(expiredRow[0].deleting_at).toBeTruthy();
    await request.post(`${backend}/_test/age-delete/${album}`);
    const sweep = await (await request.post(`${backend}/_test/sweep`)).json();
    expect(sweep.keys.filter((key: string) => key.includes(album))).toEqual([]);
    expect(await (await request.get(`${backend}/rest/v1/guest_media?album_id=eq.${album}`)).json()).toEqual([]);
    expect(await (await request.get(`${backend}/rest/v1/guest_albums?id=eq.${album}`)).json()).toEqual([]);
  } finally {
    await request.patch(`${backend}/rest/v1/app_settings?id=eq.1`, { data: { guest_retention_days: 90 } });
  }
});

test("date edit before uploads, retention warning, and confirmed owner deletion", async ({ page, context, request }) => {
  test.setTimeout(90000);
  const album = randomUUID();
  const token = randomUUID();
  const date = (daysAgo: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() - daysAgo * 86400000));
  expect((await request.post(`${backend}/rest/v1/guest_albums`, { data: { id: album, owner_id: owner, name: "날짜 수정 테스트", wedding_date: date(0), upload_token: token } })).ok()).toBeTruthy();
  await login(context);
  await page.goto(`${origin}/customer-select/guest/${album}`);
  await expect(page.getByAltText("하객 업로드 QR 코드")).toBeVisible();
  await page.getByLabel("결혼식 날짜").fill(date(85));
  await page.getByRole("button", { name: "날짜 저장" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "5일 뒤 보관이 끝나요" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("결혼식 날짜")).toHaveValue(date(85));
  await expect(page.getByRole("alert").filter({ hasText: "5일 뒤 보관이 끝나요" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/guest-manage-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/guest-manage-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.goto(`${origin}/customer-select/guest/${album}/download`);
  await expect(page.getByRole("alert").filter({ hasText: "5일 뒤 보관이 끝나요" })).toBeVisible();
  await page.goto(`${origin}/customer-select/guest/${album}`);
  await page.getByRole("button", { name: "앨범 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();
  expect((await (await request.get(`${backend}/rest/v1/guest_albums?id=eq.${album}`)).json())[0].deleting_at).toBeNull();
  await page.getByRole("button", { name: "앨범 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "앨범 삭제", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`${backend}/rest/v1/guest_albums?id=eq.${album}`)).json())[0].deleting_at).not.toBeNull();
  await request.post(`${backend}/_test/age-delete/${album}`);
  await request.post(`${backend}/_test/sweep`);
  expect(await (await request.get(`${backend}/rest/v1/guest_albums?id=eq.${album}`)).json()).toEqual([]);
});

test("public endpoints enforce device and IP limits", async ({ context, browser, request }) => {
  test.setTimeout(90000);
  const album = randomUUID();
  const token = randomUUID();
  await request.post(`${backend}/rest/v1/guest_albums`, { data: { id: album, owner_id: owner, name: "속도 제한", wedding_date: "2099-01-01", upload_token: token } });
  await request.delete(`${backend}/rest/v1/guest_rate_limits?requests=gt.0`);
  await request.patch(`${backend}/rest/v1/app_settings?id=eq.1`, { data: { guest_device_requests_per_minute: 1, guest_ip_requests_per_minute: 100 } });
  const second = await browser.newContext();
  try {
    expect((await context.request.post(`${origin}/api/guest/${token}/submissions`, { data: { name: "하객" } })).status()).toBe(200);
    for (const path of ["submissions", "media/presign", "media/complete"]) {
      expect((await context.request.post(`${origin}/api/guest/${token}/${path}`, { data: { name: "하객" } })).status()).toBe(429);
    }
    expect((await second.request.post(`${origin}/api/guest/${token}/submissions`, { data: { name: "다른 기기" } })).status()).toBe(200);
    await request.patch(`${backend}/rest/v1/app_settings?id=eq.1`, { data: { guest_device_requests_per_minute: 100, guest_ip_requests_per_minute: 1 } });
    expect((await second.request.post(`${origin}/api/guest/${token}/submissions`, { data: { name: "다른 기기" } })).status()).toBe(429);
  } finally {
    await second.close();
    await request.patch(`${backend}/rest/v1/app_settings?id=eq.1`, { data: { guest_device_requests_per_minute: 120, guest_ip_requests_per_minute: 1200 } });
    await request.delete(`${backend}/rest/v1/guest_albums?id=eq.${album}`);
  }
});
