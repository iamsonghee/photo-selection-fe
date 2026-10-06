/**
 * tests/auth-callback.test.mjs 전용 모듈 로더 훅.
 * - `@/...` 경로를 `src/...`로 푼다(Next의 tsconfig paths 대용).
 * - Supabase에 실제로 붙는 모듈만 가짜로 바꾼다. 가짜 객체는 테스트가 `globalThis.__authCallbackMocks`에
 *   넣어 두고, 가짜 모듈은 호출 시점에 그 값을 읽는다.
 */
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

const MOCKS = {
  "@/lib/supabase/server": "export async function createClient() { return globalThis.__authCallbackMocks.supabase; }",
  "@/lib/supabase-admin": "export function getAdminClient() { return globalThis.__authCallbackMocks.admin; }",
  "@/lib/app-settings": "export async function getAppSettings() { return { betaDefaultDurationDays: 30 }; }",
};

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

export async function resolve(specifier, context, next) {
  if (MOCKS[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(MOCKS[specifier])}`, shortCircuit: true };
  }
  // next 패키지는 exports 맵이 없어 node ESM에서는 확장자가 필요하다.
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
      if (isFile(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
