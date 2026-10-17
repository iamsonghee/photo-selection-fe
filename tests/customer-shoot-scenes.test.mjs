import assert from "node:assert/strict";
import { CUSTOMER_SHOOT_TYPES, customerPlaceNames, customerSceneCatalog, customerSceneGapSeconds, customerSceneLabelBasis, customerSceneLabelOptions, customerShootTypeLabel, isCustomerShootType } from "../src/lib/customer-shoot-scenes.ts";

// 새 촬영 종류와 예전 셀프 고객 프로젝트 값(wedding 등)을 모두 허용한다.
for (const { value } of CUSTOMER_SHOOT_TYPES) assert.equal(isCustomerShootType(value), true);
for (const legacy of ["wedding", "family", "graduation", "profile", "etc"]) assert.equal(isCustomerShootType(legacy), true);
assert.equal(isCustomerShootType("unknown"), false);
assert.equal(isCustomerShootType("toString"), false);
assert.equal(isCustomerShootType(null), false);

assert.equal(customerShootTypeLabel("wedding_ceremony"), "웨딩 본식");
assert.equal(customerShootTypeLabel("wedding"), "웨딩");
assert.equal(customerShootTypeLabel(null), "촬영 유형 미입력");

// 장면 목록은 촬영 종류별로 시간 순서대로 관리하고, 목록이 없는 종류는 빈 배열이다.
// 웨딩 본식은 촬영 단계 14개(2026-10-14 1차 목록, docs/wedding-ceremony-scene-plan.md §4.2).
assert.deepEqual(customerSceneCatalog("wedding_ceremony"), [
  "웨딩홀·디테일", "메이크업·준비", "신부대기실", "로비·하객 맞이", "신랑신부 연출촬영", "화촉점화·혼주 입장", "신랑 입장",
  "신부 입장", "예식", "축가·축하공연", "행진·퇴장", "원판·단체 기념촬영", "폐백", "피로연·연회장",
]);
assert.deepEqual(customerSceneCatalog("wedding"), []);
// 홈스냅만 장면 경계 공백을 짧게(75초) 둔다. 나머지는 기본값(undefined → 3분).
assert.equal(customerSceneGapSeconds("home_snap"), 75);
assert.equal(customerSceneGapSeconds("first_birthday"), undefined);
// 홈스냅만 흔들림 확인에서 장소를 판정해 장면을 장소별로 다시 나눈다(장면 이름 목록 그대로 보낸다).
assert.deepEqual(customerPlaceNames("home_snap"), customerSceneCatalog("home_snap"));
assert.equal(customerPlaceNames("first_birthday"), undefined);
assert.deepEqual(customerSceneCatalog("etc"), []);
// 사진마다 라벨로 나누는 종류: 홈스냅은 장소, 웨딩 본식은 촬영 단계(판단 기준 포함). 나머지는 라벨 옵션 없음.
assert.equal(customerSceneLabelBasis("home_snap"), "place");
assert.equal(customerSceneLabelBasis("wedding_ceremony"), "stage");
assert.equal(customerSceneLabelBasis("first_birthday"), undefined);
assert.equal(customerPlaceNames("wedding_ceremony"), undefined); // 장소 진행 문구("장소를 보고 …")는 홈스냅에만
assert.deepEqual(customerSceneLabelOptions("home_snap"), { placeNames: customerSceneCatalog("home_snap"), placeBasis: "place" });
const ceremony = customerSceneLabelOptions("wedding_ceremony");
assert.equal(ceremony.placeBasis, "stage");
assert.deepEqual(ceremony.placeNames, customerSceneCatalog("wedding_ceremony"));
assert.deepEqual(Object.keys(ceremony.placeHints ?? {}), customerSceneCatalog("wedding_ceremony")); // 단계마다 판단 기준
for (const hint of Object.values(ceremony.placeHints ?? {})) assert.ok(hint.length > 0 && hint.length <= 200); // API 라우트 상한
// 본식 단계도 함께 보낸다(clip-service가 카메라별 본식 범위·카메라 합치기에 쓴다) — 모두 단계 목록에 있는 이름.
assert.deepEqual(ceremony.placeMainStages, ["화촉점화·혼주 입장", "신랑 입장", "신부 입장", "예식", "축가·축하공연", "행진·퇴장"]);
assert.ok(ceremony.placeMainStages.every((name) => customerSceneCatalog("wedding_ceremony").includes(name)));
for (const name of customerSceneCatalog("wedding_ceremony")) assert.ok(name.length <= 40);
assert.deepEqual(customerSceneLabelOptions("first_birthday"), {});
assert.equal(new Set(CUSTOMER_SHOOT_TYPES.map(({ value }) => value)).size, CUSTOMER_SHOOT_TYPES.length);
console.log("customer-shoot-scenes ok");
