import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/landing/use-landing-animation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const compiledModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputText)(require, compiledModule, compiledModule.exports);
const { shouldUseStaticLanding } = compiledModule.exports;
for (const hints of [
  { connection: { saveData: true } },
  ...["slow-2g", "2g", "3g"].map((effectiveType) => ({ connection: { effectiveType } })),
  { connection: { downlink: 1.5 } }, { deviceMemory: 4 }, { hardwareConcurrency: 4 },
]) assert.equal(shouldUseStaticLanding(hints), true, JSON.stringify(hints));
for (const hints of [
  {}, { deviceMemory: 0, hardwareConcurrency: 0, connection: { downlink: 0 } },
  { deviceMemory: 8, hardwareConcurrency: 8, connection: { effectiveType: "4g", downlink: 10 } },
]) assert.equal(shouldUseStaticLanding(hints), false, JSON.stringify(hints));
console.log("Static landing device/network hints: passed");
