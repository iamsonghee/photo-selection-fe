/**
 * /auth/callback 라우트 — 복귀 경로 쿠키와 셀프 고객 로그인 분기.
 * Supabase 호출(세션 교환·admin 쿼리)만 가짜로 바꾸고 라우트 코드는 그대로 실행한다.
 * 실행: node tests/auth-callback.test.mjs
 */
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/auth-callback-loader.mjs", import.meta.url);

const COOKIE = "acut_post_login_redirect";
const ORIGIN = "http://localhost:3001";

/** supabase-js 쿼리 빌더 흉내 — 어떤 체인이든 await하면 테이블·작업에 맞는 결과를 돌려준다. */
function fakeAdmin(state) {
  return {
    from(table) {
      const q = { op: "select", payload: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        limit: () => builder,
        single: () => builder,
        maybeSingle: () => builder,
        insert(payload) { q.op = "insert"; q.payload = payload; return builder; },
        update(payload) { q.op = "update"; q.payload = payload; return builder; },
        then(onFulfilled, onRejected) {
          let result = { data: null, error: null };
          if (q.op === "insert") state.inserts.push({ table, payload: q.payload });
          else if (q.op === "update") state.updates.push({ table, payload: q.payload });
          else if (table === "photographers") result = { data: state.existingPhotographer, error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

function setup({ existingPhotographer = null } = {}) {
  const state = { existingPhotographer, inserts: [], updates: [] };
  globalThis.__authCallbackMocks = {
    admin: fakeAdmin(state),
    supabase: {
      auth: {
        async exchangeCodeForSession(code) {
          return code === "good"
            ? { data: { user: { id: "auth-1", email: "someone@example.com" } }, error: null }
            : { data: null, error: { message: "bad code" } };
        },
      },
    },
  };
  return state;
}

const { GET } = await import("../src/app/auth/callback/route.ts");
const { NextRequest } = await import("next/server");

async function callback({ code = "good", cookie, query } = {}) {
  const url = new URL("/auth/callback", ORIGIN);
  if (code) url.searchParams.set("code", code);
  if (query) url.searchParams.set("next", query);
  const headers = {};
  if (cookie !== undefined) headers.cookie = `${COOKIE}=${encodeURIComponent(cookie)}`;
  const response = await GET(new NextRequest(url, { headers }));
  return {
    location: response.headers.get("location"),
    setCookie: response.headers.get("set-cookie") ?? "",
  };
}

const events = (state) => state.inserts.filter((i) => i.table === "beta_usage_events").map((i) => i.payload.event_type);
const photographerInserts = (state) => state.inserts.filter((i) => i.table === "photographers");

// 1) 셀프 고객 로그인(신규 계정): /customer-select로 바로, photographers 행은 만들되 작가 지표는 없음, 쿠키는 지움
{
  const state = setup();
  const r = await callback({ cookie: "/select/projects" });
  assert.equal(r.location, `${ORIGIN}/select/projects`);
  assert.equal(photographerInserts(state).length, 1);
  assert.equal(photographerInserts(state)[0].payload.auth_id, "auth-1");
  assert.deepEqual(events(state), []);
  assert.match(r.setCookie, new RegExp(`${COOKIE}=;`));
  assert.match(r.setCookie, /[Mm]ax-[Aa]ge=0/);
  assert.match(r.setCookie, /[Pp]ath=\//);
}

// 2) 셀프 고객 로그인(기존 계정): 행은 안 만들고 first_login도 안 남김
{
  const state = setup({ existingPhotographer: { id: "p-1" } });
  const r = await callback({ cookie: "/select/new" });
  assert.equal(r.location, `${ORIGIN}/select/new`);
  assert.equal(photographerInserts(state).length, 0);
  assert.deepEqual(events(state), []);
}

// 3) 공통 로그인: 공간 선택으로, 작가 지표 없음
{
  const state = setup();
  const r = await callback({});
  assert.equal(r.location, `${ORIGIN}/workspaces`);
  assert.equal(photographerInserts(state).length, 1);
  assert.deepEqual(events(state), []);
}

// 4) 작가 로그인(기존 계정, /beta/apply에서 시작): 그곳으로 바로, first_login만 시도
{
  const state = setup({ existingPhotographer: { id: "p-1" } });
  const r = await callback({ cookie: "/beta/apply" });
  assert.equal(r.location, `${ORIGIN}/beta/apply`);
  assert.equal(photographerInserts(state).length, 0);
  assert.deepEqual(events(state), ["first_login"]);
}

// 5) 신뢰할 수 없는 복귀 경로(다른 출처)는 대시보드로 — 쿠키·쿼리 모두
{
  setup({ existingPhotographer: { id: "p-1" } });
  assert.equal((await callback({ cookie: "https://evil.example/" })).location, `${ORIGIN}/workspaces`);
  assert.equal((await callback({ cookie: "//evil.example/" })).location, `${ORIGIN}/workspaces`);
  assert.equal((await callback({ query: "https://evil.example/" })).location, `${ORIGIN}/workspaces`);
}

// 6) 쿠키가 없으면 쿼리 next를 보조로 쓴다(같은 출처 경로만)
{
  const state = setup({ existingPhotographer: { id: "p-1" } });
  const r = await callback({ query: "/select/projects" });
  assert.equal(r.location, `${ORIGIN}/select/projects`);
  assert.deepEqual(events(state), []);
}

// 7) code 없음 → 홈, 세션 교환 실패 → 오류 쿼리와 함께 홈. DB는 건드리지 않음
{
  const state = setup();
  assert.equal(new URL((await callback({ code: null, cookie: "/select/projects" })).location).pathname, "/login");
  const failed = await callback({ code: "bad", cookie: "/select/projects" });
  assert.equal(new URL(failed.location).pathname, "/login");
  assert.equal(new URL(failed.location).searchParams.get("error"), "oauth");
  assert.equal(new URL(failed.location).searchParams.get("next"), "/select/projects");
  assert.match(failed.setCookie, /[Mm]ax-[Aa]ge=0/);
  assert.equal(state.inserts.length, 0);
}

console.log("auth-callback: ok");

// 명시적 스튜디오 진입은 기존 작가 지표를 유지한다.
{
  const state = setup();
  const r = await callback({ cookie: "/studio/dashboard" });
  assert.equal(r.location, `${ORIGIN}/studio/dashboard`);
  assert.deepEqual(events(state), ["signup_completed", "first_login"]);
}
// 초대 링크와 일반 로그인은 작가 이용 지표에 섞지 않는다.
{
  const state = setup();
  const r = await callback({ cookie: "/c/example/review", query: "/studio/dashboard" });
  assert.equal(r.location, `${ORIGIN}/c/example/review`);
  assert.deepEqual(events(state), []);
}
