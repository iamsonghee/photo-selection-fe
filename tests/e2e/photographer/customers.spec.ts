import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsPhotographer } from "../../helpers/auth";

// Only synthetic records created here are edited/deleted. Existing customer work is untouched.
test("고객관리 — 실제 저장·프로젝트 연결·PC·모바일", async ({ page }) => {
  test.setTimeout(120000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { userId } = await loginAsPhotographer(page);
  const { data: photographer, error: ownerError } = await admin.from("photographers").select("id").eq("auth_id", userId).single();
  expect(ownerError).toBeNull();
  const owner = photographer!.id;
  const unique = `고객관리검증${Date.now()}`;
  const customerIds = new Set<string>();
  const projectIds: string[] = [];
  const phone = "01000000001";
  try {
    const seed = await admin.from("projects").insert({
      name: `${unique} 촬영`, customer_name: unique, customer_phone: phone,
      photographer_id: owner, shoot_date: "2026-10-01", deadline: "2026-10-10", required_count: 1,
      photo_count: 0, status: "delivered", delivered_at: "2026-10-02T00:00:00Z", access_token: crypto.randomUUID(),
    }).select("id,customer_id").single();
    expect(seed.error).toBeNull();
    projectIds.push(seed.data!.id); customerIds.add(seed.data!.customer_id);
    const customerId = seed.data!.customer_id;
    // Initial customer rows are present before JavaScript runs.
    const html = await page.request.get("/photographer/customers");
    expect(html.status()).toBe(200);
    expect(await html.text()).toContain(unique);
    let initialListRequests = 0;
    page.on("request", request => { if (request.url().includes("/api/photographer/customers?")) initialListRequests++; });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/photographer/customers");
      const list = page.getByRole("region", { name: "고객 목록", exact: true });
      if (width === 1280) expect(initialListRequests).toBe(0);
      await page.getByRole("searchbox").fill(unique);
      await list.getByRole("button", { name: new RegExp(unique) }).click();
      const detail = page.getByRole("article", { name: "고객 상세" });
      await expect(detail.getByRole("heading", { name: unique, exact: true })).toBeVisible();
      await expect(detail.getByRole("link", { name: "프로젝트 보기", exact: true })).toHaveAttribute("href", `/photographer/projects/${seed.data!.id}`);
      await expect(detail.getByRole("link", { name: "최종 보정본 보기", exact: true })).toHaveAttribute("href", `/photographer/projects/${seed.data!.id}/assets/final`);
      await detail.getByRole("region", { name: "고객 메모" }).getByRole("button").click();
      await page.getByRole("textbox", { name: "다음 촬영에 참고할 내용" }).fill(`저장 검증 ${width}`);
      await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.reload();
      await expect(detail.getByText(`저장 검증 ${width}`, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `/tmp/customers-live-${width}.png`, fullPage: true });
    }

    // Customer master edits preserve past project identity and refresh after reload.
    const detail = page.getByRole("article", { name: "고객 상세" });
    await detail.getByRole("button", { name: "정보 수정", exact: true }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "고객 이름", exact: true }).fill(`${unique}수정`);
    await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(detail.getByRole("heading", { name: `${unique}수정`, exact: true })).toBeVisible();
    const original = await admin.from("projects").select("customer_name,customer_id").eq("id", seed.data!.id).single();
    expect(original.data!.customer_name).toBe(unique);
    expect(original.data!.customer_id).toBe(customerId);

    const quota = await (await page.request.get("/api/photographer/quota")).json();
    await detail.getByRole("button", { name: "새 프로젝트 만들기", exact: true }).click();
    if (quota.max !== null && quota.current >= quota.max) {
      await expect(page.getByRole("dialog")).toBeVisible();
    } else {
      await expect(page).toHaveURL(new RegExp(`/photographer/projects/new\\?customerId=${customerId}`));
      await expect(page.locator("#field-customerName input")).toHaveValue(`${unique}수정`);
      await expect(page.locator("#field-customerPhone input")).toHaveValue("010-0000-0001");
      const created = await page.request.post("/api/photographer/projects", { data: {
        name: `${unique} 연결 생성`, customer_name: `${unique}수정`, customer_phone: phone, customer_id: customerId,
        shoot_date: "2026-10-03", deadline: "2026-10-10", required_count: 1,
      } });
      expect(created.status()).toBe(201);
      const { id } = await created.json(); projectIds.push(id);
      const linked = await admin.from("projects").select("customer_id").eq("id", id).single();
      expect(linked.data!.customer_id).toBe(customerId);
    }

    const patched = await page.request.patch(`/api/photographer/projects/${seed.data!.id}`, { data: { customer_name: `${unique}다른고객`, customer_phone: phone } });
    expect(patched.status()).toBe(200);
    const { customerId: movedId } = await patched.json(); customerIds.add(movedId);
    expect(movedId).not.toBe(customerId);
    await page.goto(`/photographer/projects/${seed.data!.id}`);
    const customerLink = page.getByRole("link", { name: `${unique}다른고객`, exact: true }).filter({ visible: true });
    await customerLink.click();
    await expect(page).toHaveURL(new RegExp(`/photographer/customers\\?customerId=${movedId}`));
    await expect(page.getByRole("heading", { name: `${unique}다른고객`, exact: true })).toBeVisible();

    // Removing the last project keeps the customer and their independently stored notes.
    const deleted = await admin.from("projects").delete().in("id", projectIds).eq("photographer_id", owner);
    expect(deleted.error).toBeNull();
    const retainedResponse = await page.request.get(`/api/photographer/customers/${customerId}`);
    expect(retainedResponse.status()).toBe(200);
    const retained = await retainedResponse.json();
    expect(retained.customer.projects).toEqual([]);
    expect(retained.customer.note).toBe("저장 검증 390");
    await page.goto(`/photographer/customers?customerId=${customerId}`);
    await expect(page.getByText("아직 촬영 이력이 없어요.", { exact: true })).toBeVisible();
  } finally {
    if (projectIds.length) {
      // Collect auto-created customers even if an assertion failed during relinking.
      const remaining = await admin.from("projects").select("customer_id").in("id", projectIds).eq("photographer_id", owner);
      for (const project of remaining.data ?? []) if (project.customer_id) customerIds.add(project.customer_id);
      const result = await admin.from("projects").delete().in("id", projectIds).eq("photographer_id", owner);
      expect(result.error).toBeNull();
    }
    if (customerIds.size) {
      const result = await admin.from("photographer_customers").delete().in("id", [...customerIds]).eq("photographer_id", owner);
      expect(result.error).toBeNull();
    }
  }
});

test("고객관리 — 저장 실패 시 입력 보존, 빈 목록과 재시도", async ({ page }) => {
  await loginAsPhotographer(page);
  const id = "20000000-0000-4000-8000-000000000001";
  let listFails = true;
  await page.route("**/api/photographer/customers?**", route => route.fulfill(listFails ? {status:500,json:{error:"목록 조회 실패"}} : {json:{customers:[],total:0,counts:{all:0,new:0,returning:0}}}));
  await page.goto("/photographer/customers");
  await page.getByRole("searchbox").fill("빈결과검증");
  await expect(page.getByText("목록 조회 실패", { exact: true })).toBeVisible();
  listFails = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("조건에 맞는 고객이 없어요", { exact: true })).toBeVisible();
  await page.route(`**/api/photographer/customers/${id}`, route => route.fulfill(route.request().method() === "PATCH" ? {status:500,json:{error:"저장 실패"}} : {json:{customer:{id,name:"오류 검증",phone:null,note:"",updatedAt:"2026-10-03T00:00:00Z",projects:[]}}}));
  await page.goto(`/photographer/customers?customerId=${id}`);
  await page.getByRole("button", { name: "메모 추가", exact: true }).click();
  const textbox = page.getByRole("textbox", { name: "다음 촬영에 참고할 내용" });
  await textbox.fill("실패해도 남아야 할 메모");
  await page.getByRole("dialog").getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("저장 실패");
  await expect(textbox).toHaveValue("실패해도 남아야 할 메모");
});

test("고객 선택 생성 폼 — 선택 ID 전달·수정 시 해제·일반 생성 회귀", async ({ page }) => {
  await loginAsPhotographer(page);
  const id = "20000000-0000-4000-8000-000000000001";
  await page.route("**/api/photographer/quota", route => route.fulfill({ json: {
    tier:"beta",current:0,max:50,maxPhotosPerProject:2000,maxRevisionCount:2,betaStatus:"active",betaApplicationStatus:null,
  } }));
  await page.route(`**/api/photographer/customers/${id}`, route => route.fulfill({json:{customer:{id,name:"전화번호 없는 고객",phone:null,note:"",updatedAt:"2026-10-03T00:00:00Z",projects:[]}}}));
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/photographer/projects", async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, json: { error: "생성 실패 검증" } });
  });
  await page.goto(`/photographer/projects/new?customerId=${id}`);
  await expect(page.locator("#field-customerName input")).toHaveValue("전화번호 없는 고객");
  await page.locator("#field-name input").fill("폼 연결 검증");
  await page.locator("#field-shootDate input").fill("2026-10-04");
  await page.locator("#field-requiredCount input").fill("1");
  await page.getByRole("button", { name: "나중에 올리기", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0].customer_id).toBe(id);
  await expect(page.getByText("생성 실패 검증", { exact: true })).toBeVisible();
  await page.locator("#field-customerName input").fill("다른 고객");
  await page.getByRole("button", { name: "나중에 올리기", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).not.toHaveProperty("customer_id");
  await page.goto("/photographer/projects/new");
  await expect(page.locator("#field-customerName input")).toBeEnabled();
  await expect(page.locator("#field-customerName input")).toHaveValue("");
});
