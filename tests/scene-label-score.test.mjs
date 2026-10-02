import assert from "node:assert/strict";
import { scoreScenes } from "../src/lib/scene-label-score.ts";

const ids = (from, to) => Array.from({ length: to - from }, (_, i) => `p${from + i}`);

// 정답: 0~29 야외, 30~59 돌상, 60~89 돌잡이. AI: 경계 하나는 2장 어긋나고(허용), 하나는 놓치고, 이름 하나 틀림.
const label = [{ name: "야외", photoIds: ids(0, 30) }, { name: "돌상", photoIds: ids(30, 60) }, { name: "돌잡이", photoIds: ids(60, 90) }];
const ai = [{ name: "야외", photoIds: ids(0, 32) }, { name: "하객", photoIds: ids(32, 90) }];
const score = scoreScenes(label, ai);
assert.equal(score.boundaryPrecision, 1); // AI 경계 1개(32)가 정답 30과 ±3 안
assert.equal(score.boundaryRecall, 0.5); // 정답 경계 2개 중 1개만 찾음
assert.equal(score.nameAccuracy, 30 / 90); // 야외 30장만 이름이 맞음(30·31번은 AI도 야외지만 정답은 돌상)
assert.equal(score.aiSceneCount, 2);

// 완전히 같으면 모두 1
const same = scoreScenes(label, label);
assert.deepEqual([same.boundaryPrecision, same.boundaryRecall, same.nameAccuracy], [1, 1, 1]);

// 장면 하나뿐(경계 없음)이고 AI도 하나면 1, AI가 쪼갰으면 precision 0
assert.equal(scoreScenes([{ name: null, photoIds: ids(0, 10) }], [{ name: null, photoIds: ids(0, 10) }]).boundaryPrecision, 1);
assert.equal(scoreScenes([{ name: null, photoIds: ids(0, 10) }], [{ name: null, photoIds: ids(0, 5) }, { name: null, photoIds: ids(5, 10) }]).boundaryPrecision, 0);

console.log("scene-label-score ok");

// AI가 같은 이름에 붙인 번호("야외 1")는 떼고 이름을 비교한다.
assert.equal(scoreScenes([{ name: "야외", photoIds: ids(0, 10) }], [{ name: "야외 1", photoIds: ids(0, 10) }]).nameAccuracy, 1);
