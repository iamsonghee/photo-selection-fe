import { register } from "node:module";
register("./helpers/auth-callback-loader.mjs", import.meta.url);
import assert from "node:assert/strict";
const {
  CUSTOMER_SELECT_POST_LOGIN_PATH,
  DEFAULT_POST_LOGIN_PATH,
  isCustomerSelectLogin,
  isStudioLogin,
  resolvePostLoginPath,
} = await import("../src/lib/post-login-redirect.ts");

// 콜백이 쿠키(또는 쿼리)로 받은 복귀 경로를 어떻게 다루는지 — 같은 출처의 절대 경로만 통과한다.
assert.equal(resolvePostLoginPath(null), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath(undefined), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath(""), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("/app/select"), "/app/select");
assert.equal(resolvePostLoginPath("/beta/apply"), "/beta/apply");
assert.equal(resolvePostLoginPath("/app/studio/dashboard"), "/app/studio/dashboard");
// setPostLoginRedirect()는 encodeURIComponent로 저장한다 — 인코딩된 값도 같은 경로로 푼다.
assert.equal(resolvePostLoginPath(encodeURIComponent("/app/select")), "/app/select");
assert.equal(resolvePostLoginPath("%2Fcustomer-select%2Fnew"), "/app/select/new");

// 열린 리다이렉트 방지: 다른 출처로 해석될 수 있는 값은 모두 기본 목적지.
assert.equal(resolvePostLoginPath("https://evil.example/phish"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("//evil.example/phish"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("/\\evil.example"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("customer-select"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("/customer-select\r\nSet-Cookie: x=1"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("/a b"), DEFAULT_POST_LOGIN_PATH);
assert.equal(resolvePostLoginPath("%E0%A4%A"), DEFAULT_POST_LOGIN_PATH); // 깨진 인코딩
assert.equal(resolvePostLoginPath("/" + "x".repeat(600)), DEFAULT_POST_LOGIN_PATH);

// 셀프 고객 로그인 판정 — 콜백이 작가 가입·첫 로그인 지표를 건너뛰는 기준.
assert.equal(CUSTOMER_SELECT_POST_LOGIN_PATH, "/app/select");
assert.equal(isCustomerSelectLogin("/app/select"), true);
assert.equal(isCustomerSelectLogin("/app/select/new"), true);
assert.equal(isCustomerSelectLogin("/customer-select-ish"), false);
assert.equal(isCustomerSelectLogin("/app/studio/dashboard"), false);
assert.equal(isCustomerSelectLogin("/beta/apply"), false);
assert.equal(isCustomerSelectLogin(DEFAULT_POST_LOGIN_PATH), false);

console.log("post-login-redirect: ok");

for (const path of ["/login", "/login?next=/login", "/auth/callback", "/api/auth/test-login", "/app/select/login", "/a/../login", "/%5cevil.example"]) {
  assert.equal(resolvePostLoginPath(path), DEFAULT_POST_LOGIN_PATH);
}
assert.equal(resolvePostLoginPath("/c/token/review?photo=1"), "/c/token/review?photo=1");
assert.equal(isStudioLogin("/workspaces"), false);
assert.equal(isStudioLogin("/app/select"), false);
assert.equal(isStudioLogin("/app/studio/dashboard?tab=all"), true);
assert.equal(isStudioLogin("/beta/apply"), true);

assert.equal(resolvePostLoginPath("/photographer/projects/id?tab=files#photo"), "/app/studio/projects/id?tab=files#photo");
assert.equal(resolvePostLoginPath("/customer-select/id/select?invite=1"), "/app/select/id/select?invite=1");
assert.equal(resolvePostLoginPath("/customer-select/result/id/access?result_token=test"), "/customer-select/result/id/access?result_token=test");
assert.equal(resolvePostLoginPath("/customer-select/login"), DEFAULT_POST_LOGIN_PATH);
assert.equal(isStudioLogin("/photographer/dashboard"), true);
assert.equal(isCustomerSelectLogin("/customer-select/new"), true);

assert.equal(resolvePostLoginPath("/safe/..//evil.example"), DEFAULT_POST_LOGIN_PATH);
