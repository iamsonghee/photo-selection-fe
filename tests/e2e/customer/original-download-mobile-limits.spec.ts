import { expect, test, devices, type Page } from "@playwright/test";
import { deleteTestProject, setupFullProject, type TestProject } from "../../helpers/setup";

const MIB = 1024 * 1024;
const mobileDevice = { ...devices["iPhone 13"] };
Reflect.deleteProperty(mobileDevice, "defaultBrowserType");
let project: TestProject;

function originalFiles(byteSizes: number[], selectedIndexes: number[] = []) {
  return byteSizes.map((byteSize, index) => ({
    photoId: `original-${index + 1}`,
    filename: `original-${index + 1}.jpg`,
    byteSize,
    isSelected: selectedIndexes.includes(index),
  }));
}

async function mockOriginalDownload(page: Page, byteSizes: number[], selectedIndexes: number[] = []) {
  const files = originalFiles(byteSizes, selectedIndexes);
  await page.route(/\/api\/c\/original-download\?/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        visible: true,
        available: true,
        expired: false,
        preparing: false,
        failed: false,
        fileCount: files.length,
        totalBytes: byteSizes.reduce((sum, size) => sum + size, 0),
        expiresAt: "2099-12-31T00:00:00.000Z",
        files,
        archivePreparing: false,
        archiveFailed: false,
        archiveBlocked: false,
        incompleteOriginalCount: 0,
        archiveFiles: [],
      }),
    });
  });
  return files;
}

async function openFileSelection(page: Page) {
  await page.goto(`/c/${project.accessToken}`);
  await page.getByRole("button", { name: "납품용 원본 다운로드" }).click();
  await page.getByRole("button", { name: "개별 파일 선택", exact: true }).first().click();
}

async function expectFullyInViewport(page: Page, locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function installDesktopDirectoryPicker(page: Page) {
  await page.addInitScript(() => {
    type DownloadTestWindow = typeof window & {
      __savedFilenames?: string[];
      showDirectoryPicker?: () => Promise<unknown>;
    };
    const testWindow = window as DownloadTestWindow;
    testWindow.__savedFilenames = [];
    testWindow.showDirectoryPicker = async () => ({
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        if (!options?.create) throw new DOMException("not found", "NotFoundError");
        return {
          createWritable: async () => new WritableStream({
            write() {},
            close() { testWindow.__savedFilenames?.push(name); },
          }),
        };
      },
    });
  });
}

async function mockSelectedFileDownloads(page: Page, files: ReturnType<typeof originalFiles>) {
  const audit = { requestedIds: [] as string[], responseCount: 0 };
  await page.route("**/api/c/original-download/files?*", async (route) => {
    const body = route.request().postDataJSON() as { photoIds: string[] };
    audit.requestedIds = body.photoIds;
    const responseFiles = files.filter((file) => body.photoIds.includes(file.photoId)).map((file) => ({
      ...file,
      url: `https://download.test/${file.photoId}`,
    }));
    audit.responseCount = responseFiles.length;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: responseFiles }) });
  });
  await page.route("https://download.test/**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: "test-image" }));
  return audit;
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  project = await setupFullProject(page, 3);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await deleteTestProject(page, project.projectId);
  await page.close();
});

test.describe("고객 원본 개별 다운로드 — 모바일", () => {
  test.use(mobileDevice);

  test("10장까지만 선택하고, 해제 후 다른 사진을 선택할 수 있다", async ({ page }) => {
    await mockOriginalDownload(page, Array.from({ length: 12 }, () => 3 * MIB));
    await openFileSelection(page);

    await expect(page.getByText("휴대폰에서 안정적으로 저장하려면 한 번에 10장, 총 100MB 이내로 나누어 저장해 주세요.")).toBeVisible();
    await expect(page.getByText("전체 선택", { exact: true })).toHaveCount(0);
    await expectFullyInViewport(page, page.getByRole("button", { name: "선택한 사진 저장 (0)" }));

    for (let index = 1; index <= 10; index++) {
      await page.getByRole("checkbox", { name: `original-${index}.jpg 선택` }).check();
    }
    await expect(page.getByText("10 / 10 · 30.0 MB")).toBeVisible();

    await page.getByRole("checkbox", { name: "original-11.jpg 선택" }).click();
    await expect(page.getByText(/안정적인 저장을 위해 한 번에 10장까지 선택할 수 있어요/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "original-11.jpg 선택" })).not.toBeChecked();

    await page.getByRole("checkbox", { name: "original-1.jpg 선택" }).uncheck();
    await page.getByRole("checkbox", { name: "original-11.jpg 선택" }).check();
    await expect(page.getByRole("checkbox", { name: "original-11.jpg 선택" })).toBeChecked();
    await expect(page.getByText("10 / 10 · 30.0 MB")).toBeVisible();
  });

  test("100MiB를 넘기는 사진만 선택하지 않고 용량 이유를 안내한다", async ({ page }) => {
    await mockOriginalDownload(page, [...Array.from({ length: 8 }, () => 12 * MIB), 10 * MIB]);
    await openFileSelection(page);

    for (let index = 1; index <= 8; index++) {
      await page.getByRole("checkbox", { name: `original-${index}.jpg 선택` }).check();
    }
    await expect(page.getByText("8 / 10 · 96.0 MB")).toBeVisible();
    await page.getByRole("checkbox", { name: "original-9.jpg 선택" }).click();
    await expect(page.getByText(/안정적인 저장을 위해 한 번에 100MB까지 선택할 수 있어요/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "original-9.jpg 선택" })).not.toBeChecked();
    await expect(page.getByText("8 / 10 · 96.0 MB")).toBeVisible();
  });

  test("고객이 선택한 사진을 한 번에 체크·해제하고 아이콘으로 초기화한다", async ({ page }) => {
    await mockOriginalDownload(page, Array.from({ length: 12 }, () => 3 * MIB), [0, 2, 4, 6, 8, 10]);
    await openFileSelection(page);

    const customerSelectionCheckbox = page.getByRole("checkbox", { name: "내가 선택한 사진 모두 체크 6장" });
    await expect(customerSelectionCheckbox).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /original-\d+\.jpg 선택/ })).toHaveCount(12);
    await expect(page.getByText("선택됨", { exact: true })).toHaveCount(6);

    await customerSelectionCheckbox.check();
    await expect(page.getByText("6 / 10 · 18.0 MB")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "original-1.jpg 선택" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "original-2.jpg 선택" })).not.toBeChecked();

    await customerSelectionCheckbox.uncheck();
    await expect(page.getByText("0 / 10 · 0 B")).toBeVisible();

    await page.getByRole("checkbox", { name: "original-2.jpg 선택" }).check();
    await page.getByRole("button", { name: "다운로드 선택 초기화" }).click();
    await expect(page.getByText("0 / 10 · 0 B")).toBeVisible();
  });

  test("고객 선택 사진 전체 체크가 모바일 장수 제한을 넘으면 일부도 체크하지 않는다", async ({ page }) => {
    await mockOriginalDownload(page, Array.from({ length: 12 }, () => 3 * MIB), Array.from({ length: 11 }, (_, index) => index));
    await openFileSelection(page);

    await page.getByRole("checkbox", { name: "내가 선택한 사진 모두 체크 11장" }).click();
    await expect(page.getByText(/안정적인 저장을 위해 한 번에 10장까지 선택할 수 있어요/)).toBeVisible();
    await expect(page.locator('input[type="checkbox"][aria-label$=" 선택"]:checked')).toHaveCount(0);
    await expect(page.getByText("0 / 10 · 0 B")).toBeVisible();
  });

  test("고객 선택 사진 전체 체크가 모바일 용량 제한을 넘으면 일부도 체크하지 않는다", async ({ page }) => {
    await mockOriginalDownload(page, Array.from({ length: 6 }, () => 20 * MIB), Array.from({ length: 6 }, (_, index) => index));
    await openFileSelection(page);

    await page.getByRole("checkbox", { name: "내가 선택한 사진 모두 체크 6장" }).click();
    await expect(page.getByText(/안정적인 저장을 위해 한 번에 100MB까지 선택할 수 있어요/)).toBeVisible();
    await expect(page.locator('input[type="checkbox"][aria-label$=" 선택"]:checked')).toHaveCount(0);
    await expect(page.getByText("0 / 10 · 0 B")).toBeVisible();
  });

  test("Web Share가 정상 반환되면 완료를 단정하지 않고 선택만 초기화한다", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          (window as typeof window & { __sharedFileCount?: number }).__sharedFileCount = data.files?.length ?? 0;
        },
      });
    });
    const files = await mockOriginalDownload(page, [2 * MIB, 3 * MIB]);
    await page.route("**/api/c/original-download/files?*", async (route) => {
      const body = route.request().postDataJSON() as { photoIds: string[] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: files.filter((file) => body.photoIds.includes(file.photoId)).map((file) => ({
            ...file,
            url: `https://download.test/${file.photoId}`,
          })),
        }),
      });
    });
    await page.route("https://download.test/**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: "test-image" }));
    await openFileSelection(page);

    await page.getByRole("checkbox", { name: "original-1.jpg 선택" }).check();
    await page.getByRole("checkbox", { name: "original-2.jpg 선택" }).check();
    await page.getByRole("button", { name: "선택한 사진 저장 (2)" }).click();

    await expect.poll(() => page.evaluate(() => (window as typeof window & { __sharedFileCount?: number }).__sharedFileCount)).toBe(2);
    await expect(page.getByText("0 / 10 · 0 B")).toBeVisible();
    await expect(page.getByText("저장 완료", { exact: true })).toHaveCount(0);
  });
});

test.describe("고객 원본 개별 다운로드 — PC", () => {
  for (const count of [1, 2, 5, 10]) {
    test(`${count}개 선택 시 요청·응답·폴더 저장 개수가 모두 일치한다`, async ({ page }) => {
      await installDesktopDirectoryPicker(page);
      const files = await mockOriginalDownload(page, Array.from({ length: 12 }, () => 20 * MIB));
      const audit = await mockSelectedFileDownloads(page, files);
      await openFileSelection(page);

      await expect(page.getByText("전체 선택", { exact: true })).toHaveCount(0);
      await expect(page.getByText(/필요한 원본만 선택해 다운로드할 수 있어요/)).toBeVisible();
      await expectFullyInViewport(page, page.getByRole("button", { name: "선택한 파일 다운로드 (0)" }));
      for (let index = 1; index <= count; index++) {
        await page.getByRole("checkbox", { name: `original-${index}.jpg 선택` }).check();
      }
      await page.getByRole("button", { name: `선택한 파일 다운로드 (${count})` }).click();

      await expect.poll(() => page.evaluate(() => (window as typeof window & { __savedFilenames?: string[] }).__savedFilenames?.length)).toBe(count);
      expect(audit.requestedIds).toEqual(files.slice(0, count).map((file) => file.photoId));
      expect(audit.responseCount).toBe(count);
      await expect(page.getByText(`${count}개 파일을 선택한 폴더에 저장했습니다.`)).toBeVisible();
      await expect(page.getByText("다운로드 선택 0개 · 0 B")).toBeVisible();
    });
  }

  test("PC에서 고객 선택 사진만 일괄 체크·해제하고 수동 선택은 보존한다", async ({ page }) => {
    await installDesktopDirectoryPicker(page);
    const files = await mockOriginalDownload(page, Array.from({ length: 8 }, () => 4 * MIB), [0, 2, 5]);
    const audit = await mockSelectedFileDownloads(page, files);
    await openFileSelection(page);

    const customerSelectionCheckbox = page.getByRole("checkbox", { name: "내가 선택한 사진 모두 체크 3장" });
    await expect(customerSelectionCheckbox).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /original-\d+\.jpg 선택/ })).toHaveCount(8);
    await expect(page.getByText("선택됨", { exact: true })).toHaveCount(3);

    await page.getByRole("checkbox", { name: "original-2.jpg 선택" }).check();
    await customerSelectionCheckbox.check();
    await expect(page.getByText("다운로드 선택 4개 · 16.0 MB")).toBeVisible();
    await page.getByRole("checkbox", { name: "original-1.jpg 선택" }).uncheck();
    await expect.poll(() => customerSelectionCheckbox.evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(true);
    await customerSelectionCheckbox.check();
    await expect(page.getByText("다운로드 선택 4개 · 16.0 MB")).toBeVisible();
    await customerSelectionCheckbox.uncheck();
    await expect(page.getByText("다운로드 선택 1개 · 4.0 MB")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "original-2.jpg 선택" })).toBeChecked();

    await page.getByRole("button", { name: "다운로드 선택 초기화" }).click();
    await expect(page.getByText("다운로드 선택 0개 · 0 B")).toBeVisible();

    await customerSelectionCheckbox.check();
    await expect(page.getByText("다운로드 선택 3개 · 12.0 MB")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /original-\d+\.jpg 선택/ })).toHaveCount(8);
    await expect(page.getByRole("checkbox", { name: "original-1.jpg 선택" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "original-3.jpg 선택" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "original-6.jpg 선택" })).toBeChecked();

    await page.getByRole("button", { name: "선택한 파일 다운로드 (3)" }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __savedFilenames?: string[] }).__savedFilenames?.length)).toBe(3);
    expect(audit.requestedIds).toEqual(["original-1", "original-3", "original-6"]);
  });

  test("전체 압축파일의 기존 단일 ZIP 다운로드를 유지한다", async ({ page }) => {
    await mockOriginalDownload(page, [20 * MIB]);
    await page.route(/\/api\/c\/original-download\?/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          visible: true, available: true, expired: false, preparing: false, failed: false,
          fileCount: 1, totalBytes: 20 * MIB, expiresAt: "2099-12-31T00:00:00.000Z",
          files: originalFiles([20 * MIB]), archivePreparing: false, archiveFailed: false,
          archiveBlocked: false, incompleteOriginalCount: 0,
          archiveFiles: [{ partNumber: 1, fileCount: 1, byteSize: 20 * MIB }],
        }),
      });
    });
    await page.route("**/api/c/original-download/archive?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: [{ partNumber: 1, fileCount: 1, byteSize: 20 * MIB, url: "/test-download/archive.zip" }] }),
    }));
    await page.route("**/test-download/archive.zip", (route) => route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=archive.zip" },
      body: "zip",
    }));
    await page.goto(`/c/${project.accessToken}`);
    await page.getByRole("button", { name: "납품용 원본 다운로드" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "전체 압축파일 다운로드" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("archive.zip");
  });

  test("저장 직전에는 실제 navigator 기준으로 모바일 제한을 다시 검증한다", async ({ page }) => {
    let downloadApiCalled = false;
    await mockOriginalDownload(page, Array.from({ length: 11 }, () => 3 * MIB));
    await page.route("**/api/c/original-download/files?*", async (route) => {
      downloadApiCalled = true;
      await route.abort();
    });
    await openFileSelection(page);
    for (let index = 1; index <= 11; index++) {
      await page.getByRole("checkbox", { name: `original-${index}.jpg 선택` }).check();
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone) Mobile Safari" });
    });
    await page.getByRole("button", { name: "선택한 파일 다운로드 (11)" }).click();

    await expect(page.getByText(/안정적인 저장을 위해 한 번에 10장까지 선택할 수 있어요/)).toBeVisible();
    expect(downloadApiCalled).toBe(false);
  });

  test("저장 직전 용량 방어 검증도 다운로드 API 호출 전에 동작한다", async ({ page }) => {
    let downloadApiCalled = false;
    await mockOriginalDownload(page, Array.from({ length: 6 }, () => 20 * MIB));
    await page.route("**/api/c/original-download/files?*", async (route) => {
      downloadApiCalled = true;
      await route.abort();
    });
    await openFileSelection(page);
    for (let index = 1; index <= 6; index++) {
      await page.getByRole("checkbox", { name: `original-${index}.jpg 선택` }).check();
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Android) Chrome Mobile" });
    });
    await page.getByRole("button", { name: "선택한 파일 다운로드 (6)" }).click();

    await expect(page.getByText(/안정적인 저장을 위해 한 번에 100MB까지 선택할 수 있어요/)).toBeVisible();
    expect(downloadApiCalled).toBe(false);
  });
});
