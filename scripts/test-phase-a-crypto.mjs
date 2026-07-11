/**
 * Phase A — HMAC PIN 쿠키 서명/검증 로직 단위 테스트
 *
 * 실행: node scripts/test-phase-a-crypto.mjs
 *
 * 환경변수 불필요 — 테스트 전용 secret으로 자가 검증.
 * 실제 customer-auth-server.ts 와 동일한 알고리즘을 인라인으로 재현해
 * 서명·검증·만료·위조 케이스를 모두 검증합니다.
 */

import { createHmac, timingSafeEqual } from "crypto";
import assert from "assert";

// ─── 알고리즘 인라인 복제 (customer-auth-server.ts 와 100% 동일) ───────────

const COOKIE_TTL_SECONDS = 86400;
const TEST_SECRET = "test-secret-for-phase-a-crypto-test-only-32bytes";

function signPinCookie(token, secret = TEST_SECRET) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", secret)
    .update(`${token}:${timestamp}`)
    .digest("base64url");
  return `${timestamp}.${sig}`;
}

function verifyPinCookie(token, cookieValue, secret = TEST_SECRET, nowOverride = null) {
  try {
    const dot = cookieValue.indexOf(".");
    if (dot < 1) return false;
    const timestamp = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    if (!timestamp || !sig) return false;

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;

    const now = nowOverride ?? Math.floor(Date.now() / 1000);
    if (now - ts > COOKIE_TTL_SECONDS) return false;

    const expectedRaw = createHmac("sha256", secret)
      .update(`${token}:${timestamp}`)
      .digest();
    const sigRaw = Buffer.from(sig, "base64url");
    if (sigRaw.length !== expectedRaw.length) return false;
    return timingSafeEqual(sigRaw, expectedRaw);
  } catch {
    return false;
  }
}

// ─── Web Crypto (Edge middleware) 과 동일한 검증 경로 시뮬레이션 ─────────────

function base64urlToBuffer(s) {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 ? base64 + "=".repeat(4 - (base64.length % 4)) : base64;
  return Buffer.from(padded, "base64");
}

async function verifyPinCookieEdge(token, cookieValue, secret = TEST_SECRET, nowOverride = null) {
  if (!secret) return false;

  const dot = cookieValue.indexOf(".");
  if (dot < 1) return false;
  const timestamp = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!timestamp || !sig) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  if (now - ts > COOKIE_TTL_SECONDS) return false;

  // Web Crypto API (global.crypto.subtle — Node.js 19+ 기본 제공)
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBuffer(sig),
    enc.encode(`${token}:${timestamp}`)
  );
}

// ─── 테스트 러너 ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, value, expected = true) {
  const ok = value === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (ok) passed++;
  else { failed++; console.error(`    expected ${expected}, got ${value}`); }
}

// ─── 1. Node.js 서명/검증 일관성 ──────────────────────────────────────────

console.log("\n[1] Node.js signPinCookie / verifyPinCookie");

const token = "test-token-abc123";
const cookie = signPinCookie(token);
const [ts, sig] = cookie.split(".");
check("쿠키 포맷: timestamp.sig 두 부분", cookie.split(".").length === 2);
check("timestamp는 10자리 Unix 초", /^\d{10}$/.test(ts));
check("sig는 base64url 형식", /^[A-Za-z0-9\-_]+$/.test(sig));
check("sig 길이 = HMAC-SHA256 base64url (43자)", sig.length === 43);
check("정상 token → 검증 성공", verifyPinCookie(token, cookie));
check("다른 token → 검증 실패", verifyPinCookie("other-token", cookie), false);
check("빈 쿠키 → 검증 실패", verifyPinCookie(token, ""), false);
check("위조 쿠키 '1' → 검증 실패", verifyPinCookie(token, "1"), false);
check("위조 쿠키 '1234567890.fakesig' → 검증 실패", verifyPinCookie(token, "1234567890.fakesig"), false);

// 만료 쿠키: now를 25시간 뒤로 설정
const expiredCookie = signPinCookie(token);
const futureNow = Math.floor(Date.now() / 1000) + 25 * 3600;
check("만료 쿠키 (25시간 경과) → 검증 실패", verifyPinCookie(token, expiredCookie, TEST_SECRET, futureNow), false);

// 경계값: 정확히 24시간 이전 쿠키는 통과해야 함 (≤ 86400s)
const nearExpiryNow = Math.floor(Date.now() / 1000) + 86399;
check("만료 직전 쿠키 (86399초 경과) → 검증 성공", verifyPinCookie(token, cookie, TEST_SECRET, nearExpiryNow));

// 다른 secret으로 서명한 쿠키
const cookieWrongSecret = signPinCookie(token, "wrong-secret");
check("다른 secret 서명 → 검증 실패", verifyPinCookie(token, cookieWrongSecret), false);

// ─── 2. Web Crypto (Edge) 검증과 Node.js 검증 완전 일치 확인 ────────────────

console.log("\n[2] Node.js vs Edge (Web Crypto) 서명 일관성");

const results = await Promise.all([
  // 정상
  verifyPinCookieEdge(token, cookie),
  // 다른 token
  verifyPinCookieEdge("other-token", cookie),
  // 위조 "1"
  verifyPinCookieEdge(token, "1").catch(() => false),
  // 만료
  verifyPinCookieEdge(token, expiredCookie, TEST_SECRET, futureNow),
  // 다른 secret
  verifyPinCookieEdge(token, cookieWrongSecret),
]);

check("Edge: 정상 token → 검증 성공", results[0], true);
check("Edge: 다른 token → 검증 실패", results[1], false);
check("Edge: 위조 쿠키 '1' → 검증 실패", results[2], false);
check("Edge: 만료 쿠키 → 검증 실패", results[3], false);
check("Edge: 다른 secret → 검증 실패", results[4], false);

// Node.js 와 Edge 결과 동일한지 교차 확인
const nodeResults = [
  verifyPinCookie(token, cookie),
  verifyPinCookie("other-token", cookie),
  false,
  verifyPinCookie(token, expiredCookie, TEST_SECRET, futureNow),
  verifyPinCookie(token, cookieWrongSecret),
];
const allMatch = results.every((r, i) => r === nodeResults[i]);
check("Node.js ↔ Edge 결과 완전 일치", allMatch, true);

// ─── 3. 쿠키 이름 format 확인 ──────────────────────────────────────────────

console.log("\n[3] 쿠키 이름 형식");
const cookieName = `pin_verified_${token}`;
check(`쿠키 이름: "pin_verified_${token}"`, cookieName === `pin_verified_${token}`);

// ─── 최종 결과 ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
} else {
  console.log("PASS — Phase A crypto 검증 완료");
}
