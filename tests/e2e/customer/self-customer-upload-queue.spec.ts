import { expect, test } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

// 업로드 중에 더 넣은 사진은 버리지 않고 대기열에 모았다가 지금 업로드가 끝나면 이어서 올린다.
test("photos added while uploading are queued and uploaded right after", async ({ page }) => {
  await loginAsPhotographer(page);
  let photoCount = 10;
  const uploads: number[] = [];
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route("**/api/customer-upload/photos", async (route) => {
    const files = (route.request().postDataBuffer()?.toString("latin1").match(/name="files"/g) ?? []).length;
    uploads.push(files);
    if (uploads.length === 1) await firstHeld;
    photoCount += files;
    await route.fulfill({ json: { uploaded: files, rejected: [] } });
  });
  await page.route("**/api/customer-select/usage", (route) => route.fulfill({ json: { photoCount, limit: 2000, remaining: 2000 - photoCount } }));
  await page.route("**/api/customer-select/projects/queue-check**", (route) => route.fulfill({ json: { isOwner: true, project: {
    id: "queue-check", name: "업로드 대기열", photoCount, target: 30, photos: [], selectedIds: [], photoStates: {}, participantOpinions: {},
    participantDone: {}, participantNicknames: { red: "테스트" }, shareToken: "", shareEnabled: true, exported: false,
  } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/select/queue-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 대기열" })).toBeVisible();

  const file = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from("unused") });
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([file("a.jpg"), file("b.jpg")]);
  await expect.poll(() => uploads.length).toBe(1);
  // 첫 업로드가 끝나기 전에 3장을 더 넣는다 → 버려지지 않고 대기.
  await input.setInputFiles([file("c.jpg"), file("d.jpg"), file("e.jpg")]);
  await expect(page.getByRole("status").filter({ hasText: "사진 업로드 중" })).toContainText("대기 3장");
  releaseFirst();
  await expect.poll(() => uploads).toEqual([2, 3]);
  await expect(page.getByText("5장 올렸어요").filter({ visible: true }).first()).toBeVisible();
});

// 보정본은 촬영 시각이 없어 올린 순서가 곧 사진 순서다 — 고른 순서와 상관없이 파일명 자연 정렬(0002 < 0010) 순서로 올린다.
test("selected photos are uploaded in natural filename order", async ({ page }) => {
  await loginAsPhotographer(page);
  let photoCount = 0;
  const sent: string[][] = [];
  await page.route("**/api/customer-upload/photos", async (route) => {
    const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
    const names = body.match(/name="original_filenames"\r\n\r\n(.*)\r\n/)?.[1];
    const batch = names ? JSON.parse(names) as string[] : [];
    sent.push(batch);
    photoCount += batch.length;
    await route.fulfill({ json: { uploaded: batch.length, rejected: [] } });
  });
  await page.route("**/api/customer-select/usage", (route) => route.fulfill({ json: { photoCount, limit: 2000, remaining: 2000 - photoCount } }));
  await page.route("**/api/customer-select/projects/order-check**", (route) => route.fulfill({ json: { isOwner: true, project: {
    id: "order-check", name: "업로드 순서", photoCount, target: 30, photos: [], selectedIds: [], photoStates: {}, participantOpinions: {},
    participantDone: {}, participantNicknames: { red: "테스트" }, shareToken: "", shareEnabled: true, exported: false,
  } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/select/order-check/upload");
  await expect(page.getByRole("heading", { name: "업로드 순서" })).toBeVisible();

  const file = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from(name) });
  await page.locator('input[type="file"]').setInputFiles([file("0010_SJ8_1404.jpg"), file("0002_SJ7_3214.jpg"), file("0001_SJ7_3213.jpg")]);
  await expect.poll(() => sent.flat()).toEqual(["0001_SJ7_3213.jpg", "0002_SJ7_3214.jpg", "0010_SJ8_1404.jpg"]);
});
