import { expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

// 한 묶음을 보내는 동안 다음 묶음을 미리 압축한다 — 그래도 서버 요청은 한 번에 하나, 진행 막대는 뒤로 가지 않고,
// 실패·중단 때 남은 사진이 빠지지 않아야 한다.

type UploadMock = { sizes: number[]; maxInFlight: number; hold: (n: number) => () => void };

async function setup(page: Page, respond: (call: number) => Promise<void> | void, status: (call: number) => number = () => 200) {
  await loginAsPhotographer(page);
  const pageErrors: string[] = [];
  // 개발 서버의 첫 렌더 hydration 경고는 업로드와 무관해 뺀다 — 여기서는 업로드 중 오류(처리 안 된 중단 등)만 본다.
  page.on("pageerror", (error) => { if (!error.message.startsWith("Hydration failed")) pageErrors.push(error.message); });
  let photoCount = 0;
  let inFlight = 0;
  const mock: UploadMock = { sizes: [], maxInFlight: 0, hold: () => () => undefined };
  await page.route("**/api/customer-upload/photos", async (route) => {
    const files = (route.request().postDataBuffer()?.toString("latin1").match(/name="files"/g) ?? []).length;
    const call = mock.sizes.push(files);
    inFlight += 1;
    mock.maxInFlight = Math.max(mock.maxInFlight, inFlight);
    await respond(call);
    inFlight -= 1;
    if (status(call) !== 200) return route.fulfill({ status: status(call), json: { detail: "테스트 실패" } });
    photoCount += files;
    await route.fulfill({ json: { uploaded: files, rejected: [] } });
  });
  await page.route("**/api/customer-select/usage", (route) => route.fulfill({ json: { photoCount, limit: 3000, remaining: 3000 - photoCount } }));
  await page.route("**/api/customer-select/projects/pipeline-check**", (route) => route.fulfill({ json: { isOwner: true, project: {
    id: "pipeline-check", name: "업로드 파이프라인", photoCount, target: 30, photos: [], selectedIds: [], photoStates: {}, participantOpinions: {},
    participantDone: {}, participantNicknames: { red: "테스트" }, shareToken: "", shareEnabled: true, exported: false,
  } } }));
  // 진행 막대 값이 바뀔 때마다 기록한다.
  await page.addInitScript(() => {
    const w = window as unknown as { __pct: number[] };
    w.__pct = [];
    new MutationObserver(() => {
      const bar = document.querySelector('[aria-label="업로드 진행률"]');
      if (bar) w.__pct.push(Number(bar.getAttribute("aria-valuenow")));
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-valuenow"] });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/customer-select/pipeline-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 파이프라인" })).toBeVisible();
  const files = Array.from({ length: 45 }, (_, i) => ({ name: `p${i}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(`photo-${i}`) }));
  await page.locator('input[type="file"]').setInputFiles(files);
  return { mock, pageErrors };
}

test("uploads one batch at a time and the progress bar never goes backwards", async ({ page }) => {
  const { mock, pageErrors } = await setup(page, () => new Promise((resolve) => setTimeout(resolve, 200)));
  await expect(page.getByText("45장 올렸어요").filter({ visible: true }).first()).toBeVisible();
  expect(mock.sizes).toEqual([20, 20, 5]);
  expect(mock.maxInFlight).toBe(1);
  const pct = await page.evaluate(() => (window as unknown as { __pct: number[] }).__pct.filter((value) => value > 0));
  expect(pct.length).toBeGreaterThan(0);
  pct.forEach((value, index) => {
    expect(value).toBeLessThanOrEqual(100);
    if (index > 0) expect(value).toBeGreaterThanOrEqual(pct[index - 1]);
  });
  expect(pageErrors).toEqual([]);
});

test("a failed batch keeps every remaining photo for retry and stops sending", async ({ page }) => {
  const { mock, pageErrors } = await setup(page, () => undefined, (call) => (call === 2 ? 400 : 200));
  await expect(page.getByText("테스트 실패").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "실패 25장 다시 시도" })).toBeVisible();
  await page.waitForTimeout(500); // 미리 압축한 다음 묶음이 뒤늦게 전송되지 않는지 본다.
  expect(mock.sizes).toEqual([20, 20]);
  expect(mock.maxInFlight).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("cancelling during a batch keeps the rest for retry", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const { mock, pageErrors } = await setup(page, (call) => (call === 2 ? held : undefined));
  await expect.poll(() => mock.sizes.length).toBe(2);
  await page.getByRole("button", { name: "업로드 중단" }).click();
  await expect(page.getByText("업로드를 중단했습니다. 남은 25장을 다시 시도할 수 있어요.").first()).toBeVisible();
  release();
  await page.waitForTimeout(500);
  expect(mock.sizes).toEqual([20, 20]);
  expect(pageErrors).toEqual([]);
});
