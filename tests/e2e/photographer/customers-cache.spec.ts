import { test, expect, type Route } from "@playwright/test";
import { loginAsPhotographer } from "../../helpers/auth";

test("고객 탭과 브라우저 복귀는 캐시 재사용, 만료 갱신은 화면 유지", async ({ page }) => {
  await loginAsPhotographer(page);
  let listCalls = 0;
  const detailCalls = new Map<string, number>();
  let hold = false;
  const pending: Route[] = [];
  const customers = ["김지민", "이서연"].map((name, index) => ({ id: `20000000-0000-4000-8000-00000000000${index+1}`, name, phone: null, projectCount: 1, activeProjectCount: 0, latestShootDate: "2026-10-01", firstShootDate: "2026-10-01" }));
  const list = { customers, total: 2, counts: { all:2,new:2,returning:0 } };
  await page.route("**/api/photographer/customers?**", async route => {
    listCalls++;
    if (hold) { pending.push(route); return; }
    await route.fulfill({json:list});
  });
  await page.route(/\/api\/photographer\/customers\/[0-9a-f-]+$/, async route => {
    const id = route.request().url().split("/").at(-1)!;
    detailCalls.set(id,(detailCalls.get(id)??0)+1);
    if (hold) { pending.push(route); return; }
    await route.fulfill({json:{customer:{...customers.find(customer=>customer.id===id),note:"저장된 메모",updatedAt:"2026-10-01T00:00:00Z",projects:[]}}});
  });
  await page.goto("/photographer/customers");
  const detail = page.getByRole("article", { name:"고객 상세" });
  await expect(detail.getByRole("heading",{name:"김지민",exact:true})).toBeVisible();
  await page.evaluate(() => { for(let i=0;i<4;i++) window.dispatchEvent(new Event("focus")); });
  await page.waitForTimeout(350);
  expect(listCalls).toBe(1);
  expect(detailCalls.get(customers[0].id)).toBe(1);
  const customerList = page.getByRole("region",{name:"고객 목록",exact:true});
  await customerList.getByRole("button",{name:/이서연/}).click();
  await expect(detail.getByRole("heading",{name:"이서연",exact:true})).toBeVisible();
  await customerList.getByRole("button",{name:/김지민/}).click();
  await expect(detail.getByRole("heading",{name:"김지민",exact:true})).toBeVisible();
  expect(detailCalls.get(customers[0].id)).toBe(1);
  const filters = page.getByRole("group",{name:"고객 구분"});
  await filters.getByRole("button",{name:"신규 2",exact:true}).click();
  await expect.poll(()=>listCalls).toBe(2);
  await expect(customerList.getByRole("button",{name:/김지민/})).toBeVisible();
  await filters.getByRole("button",{name:"전체 2",exact:true}).click();
  await expect(customerList.getByRole("button",{name:/김지민/})).toBeVisible();
  await page.waitForTimeout(350);
  expect(listCalls).toBe(2);

  hold = true;
  await page.clock.setFixedTime(new Date(Date.now()+61_000));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect.poll(()=>pending.length).toBe(2);
  await expect(detail.getByRole("heading",{name:"김지민",exact:true})).toBeVisible();
  await expect(customerList.getByRole("button",{name:/김지민/})).toBeVisible();
  await expect(page.getByText("고객 정보를 불러오는 중이에요.",{exact:true})).toHaveCount(0);
  for (const route of pending) await route.fulfill(route.request().url().includes("?") ? {json:list} : {json:{customer:{...customers[0],note:"갱신된 메모",updatedAt:"2026-10-03T00:00:00Z",projects:[]}}});
  await expect(detail.getByText("갱신된 메모",{exact:true})).toBeVisible();
});
