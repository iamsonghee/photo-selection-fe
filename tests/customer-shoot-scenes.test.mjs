import assert from "node:assert/strict";
import { CUSTOMER_SHOOT_TYPES, customerPlaceNames, customerSceneCatalog, customerSceneGapSeconds, customerShootTypeLabel, isCustomerShootType } from "../src/lib/customer-shoot-scenes.ts";

// 새 촬영 종류와 예전 셀프 고객 프로젝트 값(wedding 등)을 모두 허용한다.
for (const { value } of CUSTOMER_SHOOT_TYPES) assert.equal(isCustomerShootType(value), true);
for (const legacy of ["wedding", "family", "graduation", "profile", "etc"]) assert.equal(isCustomerShootType(legacy), true);
assert.equal(isCustomerShootType("unknown"), false);
assert.equal(isCustomerShootType("toString"), false);
assert.equal(isCustomerShootType(null), false);

assert.equal(customerShootTypeLabel("wedding_ceremony"), "웨딩 본식");
assert.equal(customerShootTypeLabel("wedding"), "웨딩");
assert.equal(customerShootTypeLabel(null), "촬영 종류 미입력");

// 장면 목록은 촬영 종류별로 시간 순서대로 관리하고, 목록이 없는 종류는 빈 배열이다.
assert.deepEqual(customerSceneCatalog("wedding_ceremony").slice(0, 3), ["식전·신부 대기실", "입장", "예식(주례·서약)"]);
assert.deepEqual(customerSceneCatalog("wedding"), []);
// 홈스냅만 장면 경계 공백을 짧게(75초) 둔다. 나머지는 기본값(undefined → 3분).
assert.equal(customerSceneGapSeconds("home_snap"), 75);
assert.equal(customerSceneGapSeconds("first_birthday"), undefined);
// 홈스냅만 흔들림 확인에서 장소를 판정해 장면을 장소별로 다시 나눈다(장면 이름 목록 그대로 보낸다).
assert.deepEqual(customerPlaceNames("home_snap"), customerSceneCatalog("home_snap"));
assert.equal(customerPlaceNames("first_birthday"), undefined);
assert.deepEqual(customerSceneCatalog("etc"), []);
assert.equal(new Set(CUSTOMER_SHOOT_TYPES.map(({ value }) => value)).size, CUSTOMER_SHOOT_TYPES.length);
console.log("customer-shoot-scenes ok");
