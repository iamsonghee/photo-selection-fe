import { expect, test, type Page } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";
import { createEditingProject, deleteTestProject, type TestProject } from "../../helpers/setup";

let project: TestProject;
let previewProject: TestProject;

async function installDirectoryPicker(page: Page) {
  await page.addInitScript(() => {
    type DownloadTestWindow = typeof window & {
      __savedFilenames?: string[];
      __directoryPickerId?: string;
      showDirectoryPicker?: (options?: { id?: string }) => Promise<unknown>;
    };
    const testWindow = window as DownloadTestWindow;
    testWindow.__savedFilenames = [];
    testWindow.showDirectoryPicker = async (options) => {
      testWindow.__directoryPickerId = options?.id;
      return ({
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
    };
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  project = await createEditingProject(page, 5);
  previewProject = await createEditingProject(page, 5, false);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!project?.projectId) return;
  const page = await browser.newPage();
  await loginAsPhotographer(page);
  await deleteTestProject(page, project.projectId);
  if (previewProject?.projectId) await deleteTestProject(page, previewProject.projectId);
  await page.close();
});

test("확정된 셀렉 원본을 고른 폴더에 원본 파일명으로 스트리밍 저장한다", async ({ page }) => {
  await loginAsPhotographer(page);
  await installDirectoryPicker(page);

  let requestMethod = "";
  let requestBody: string | null = "not-called";
  await page.route(`**/api/photographer/projects/${project.projectId}/selected-originals`, async (route) => {
    requestMethod = route.request().method();
    requestBody = route.request().postData();
    const files = Array.from({ length: 3 }, (_, index) => ({
      photoId: `selected-${index + 1}`,
      filename: `SELECTED_${index + 1}.jpg`,
      byteSize: 12_345,
      url: `https://selected-original.test/${index + 1}.jpg`,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files, fileCount: files.length, totalBytes: 37_035, downloadKind: "original" }),
    });
  });
  await page.route("https://selected-original.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: "original-image-bytes" }),
  );

  await page.goto(`/photographer/projects/${project.projectId}/workflow`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "내보내기" }).click();

  const downloadButton = page.getByRole("button", { name: /셀렉 원본 다운로드/ });
  await expect(downloadButton).toBeEnabled();
  await expect(downloadButton).toContainText("선택된 3장");
  await downloadButton.click();

  await expect(page.getByText("셀렉 원본 3개를 선택한 폴더에 저장했습니다.")).toBeVisible();
  const savedFilenames = await page.evaluate(() =>
    (window as typeof window & { __savedFilenames?: string[] }).__savedFilenames ?? [],
  );
  expect(savedFilenames).toEqual(["SELECTED_1.jpg", "SELECTED_2.jpg", "SELECTED_3.jpg"]);
  expect(requestMethod).toBe("POST");
  // 선택 photo id는 클라이언트가 보내지 않고 서버가 selections에서 다시 조회한다.
  expect(requestBody).toBeNull();
  const pickerId = await page.evaluate(() =>
    (window as typeof window & { __directoryPickerId?: string }).__directoryPickerId ?? "",
  );
  expect(pickerId).toBe("acut-selected-originals");
  expect(pickerId.length).toBeLessThanOrEqual(32);
});

test("원본 미포함 프로젝트는 1200px JPEG 프리뷰로 명확히 구분해 저장한다", async ({ page }) => {
  await loginAsPhotographer(page);
  await installDirectoryPicker(page);

  await page.route(`**/api/photographer/projects/${previewProject.projectId}/selected-originals`, async (route) => {
    const files = Array.from({ length: 3 }, (_, index) => ({
      photoId: `preview-${index + 1}`,
      filename: `SELECTED_${index + 1}_preview.jpg`,
      byteSize: 0,
      url: `https://selected-preview.test/${index + 1}.jpg`,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files, fileCount: files.length, totalBytes: 0, downloadKind: "preview" }),
    });
  });
  await page.route("https://selected-preview.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: "preview-image-bytes" }),
  );

  await page.goto(`/photographer/projects/${previewProject.projectId}/workflow`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "내보내기" }).click();

  const previewButton = page.getByRole("button", { name: /셀렉 프리뷰 다운로드/ });
  await expect(previewButton).toBeEnabled();
  await expect(previewButton).toContainText("확인용 최대 1200px JPEG");
  await expect(previewButton).toContainText("보정·납품용으로는 해상도가 부족할 수 있어요.");
  await previewButton.click();

  await expect(page.getByText("셀렉 프리뷰 3개를 선택한 폴더에 저장했습니다.")).toBeVisible();
  const savedFilenames = await page.evaluate(() =>
    (window as typeof window & { __savedFilenames?: string[] }).__savedFilenames ?? [],
  );
  expect(savedFilenames).toEqual([
    "SELECTED_1_preview.jpg",
    "SELECTED_2_preview.jpg",
    "SELECTED_3_preview.jpg",
  ]);
});
