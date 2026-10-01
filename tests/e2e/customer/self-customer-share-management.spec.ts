import { test, expect, type BrowserContext } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("owner can stop and replace a self-customer invite link", async ({ page, browser }, testInfo) => {
  await loginAsPhotographer(page);
  const origin = String(testInfo.project.use.baseURL);
  const created = await page.request.post("/api/customer-select/projects", { data: {
    name: `공유 링크 검증 ${Date.now()}`,
    shootType: "wedding",
    target: 30,
    shootDate: null,
    selectionDeadline: null,
    studioName: null,
    photographerName: null,
    shootRegion: null,
    shootLocation: null,
  } });
  const createdText = await created.text();
  expect(created.ok(), createdText).toBe(true);
  const { id: projectId } = JSON.parse(createdText) as { id: string };
  const participantContexts: BrowserContext[] = [];

  try {
    const initial = await page.request.get(`/api/customer-select/projects/${projectId}`);
    const initialBody = await initial.json();
    const oldToken = initialBody.project.shareToken as string;
    expect(initialBody.project.shareEnabled).toBe(true);

    const oldContext = await browser.newContext();
    participantContexts.push(oldContext);
    const oldParticipant = await oldContext.newPage();
    await oldParticipant.goto(`${origin}/customer-select/${projectId}/select?share_token=${oldToken}`);
    await expect(oldParticipant.getByText(/사진 고르기에 초대했어요/)).toBeVisible();

    await page.goto(`/customer-select/${projectId}/settings#sharing`);
    await expect(page.getByRole("heading", { name: "함께 고르는 사람" })).toBeVisible();
    await page.getByRole("button", { name: "공유 중지", exact: true }).first().click();
    const stopDialog = page.getByRole("dialog");
    await stopDialog.getByRole("button", { name: "공유 중지", exact: true }).click();
    await expect(page.getByText("링크 공유를 중지했어요.")).toBeVisible();

    await oldParticipant.reload();
    await expect(oldParticipant.getByRole("heading", { name: /더 이상 사용할 수 없어요/ })).toBeVisible();

    await page.getByRole("button", { name: "새 링크 만들기" }).click();
    const rotateDialog = page.getByRole("dialog");
    await rotateDialog.getByRole("button", { name: "새 링크 만들기" }).click();
    await expect(page.getByText("새 초대 링크를 만들었어요.")).toBeVisible();

    const rotated = await page.request.get(`/api/customer-select/projects/${projectId}`);
    const rotatedBody = await rotated.json();
    const newToken = rotatedBody.project.shareToken as string;
    expect(rotatedBody.project.shareEnabled).toBe(true);
    expect(newToken).not.toBe(oldToken);

    const newContext = await browser.newContext();
    participantContexts.push(newContext);
    const newParticipant = await newContext.newPage();
    await newParticipant.goto(`${origin}/customer-select/${projectId}/select?share_token=${newToken}`);
    await expect(newParticipant.getByText(/사진 고르기에 초대했어요/)).toBeVisible();
  } finally {
    await Promise.all(participantContexts.map((context) => context.close()));
    const removed = await page.request.delete(`/api/customer-select/projects/${projectId}`);
    expect(removed.ok()).toBe(true);
  }
});
