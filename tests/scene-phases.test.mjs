import assert from "node:assert/strict";
import { baseSceneName, phaseScenes } from "../src/lib/scene-phases.ts";
import { customerSceneCatalog, customerSceneMainStages } from "../src/lib/customer-shoot-scenes.ts";

const catalog = customerSceneCatalog("wedding_ceremony");
const main = customerSceneMainStages("wedding_ceremony");
assert.ok(main && main.every((name) => catalog.includes(name)));
assert.equal(customerSceneMainStages("home_snap"), undefined);

// 2026-10-15 짱쭌 본식 AI 장면(저장된 이름 그대로) → 식 전 / 본식 / 식 후, 같은 묶음 반복은 "(이어서)".
const stored = ["신랑신부 연출촬영 1", "원판·단체 기념촬영 1", "신랑신부 연출촬영 2", "신부대기실", "신랑 입장", "신부 입장", "예식 1",
  "축가·축하공연", "예식 2", "행진·퇴장 1", "예식 3", "신랑신부 연출촬영 3", "행진·퇴장 2", "원판·단체 기념촬영 2", "신랑신부 연출촬영 4"];
const shown = phaseScenes(stored.map((name) => ({ name })), catalog, main);
assert.deepEqual(shown.map(({ phase, name }) => `${phase}|${name}`), [
  "pre|신랑신부 연출촬영", "pre|원판·단체 기념촬영", "pre|신랑신부 연출촬영 (이어서)", "pre|신부대기실",
  "main|신랑 입장", "main|신부 입장", "main|예식", "main|축가·축하공연", "main|예식 (이어서)", "main|행진·퇴장",
  "main|예식 (이어서)", "main|신랑신부 연출촬영", "main|행진·퇴장 (이어서)",
  "post|원판·단체 기념촬영", "post|신랑신부 연출촬영",
]);

// 목록에 없는 이름(정리 뒤 새로 올린 사진)·이름 없는 장면은 묶지 않고 그대로. 입력 객체의 다른 값은 유지한다.
const extra = phaseScenes([{ name: "예식", id: 1 }, { name: "새로 올린 사진", id: 2 }, { name: null, id: 3 }], catalog, main);
assert.deepEqual(extra, [{ name: "예식", id: 1, phase: "main" }, { name: "새로 올린 사진", id: 2 }, { name: null, id: 3 }]);

// 본식 단계가 없으면 묶지 않고 "(이어서)"만.
assert.deepEqual(phaseScenes([{ name: "신부대기실 1" }, { name: "폐백" }, { name: "신부대기실 2" }], catalog, main),
  [{ name: "신부대기실" }, { name: "폐백" }, { name: "신부대기실 (이어서)" }]);

// 번호는 목록에 있는 단계 이름일 때만 뗀다.
assert.equal(baseSceneName("예식 12", catalog), "예식");
assert.equal(baseSceneName("Room 2", catalog), "Room 2");
console.log("scene-phases ok");
