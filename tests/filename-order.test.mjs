import assert from "node:assert/strict";
import { sortFilesByName } from "../src/lib/filename-order.ts";

// 셀프 고객 업로드 순서: 숫자는 크기순(0002 < 0010, IMG_2 < IMG_10), 같은 이름은 고른 순서 유지, 원본 배열은 그대로.
const picked = [{ name: "0010_SJ8_1404.jpg" }, { name: "0002_SJ7_3214.jpg" }, { name: "0001_SJ7_3213.jpg" }];
assert.deepEqual(sortFilesByName(picked).map(({ name }) => name), ["0001_SJ7_3213.jpg", "0002_SJ7_3214.jpg", "0010_SJ8_1404.jpg"]);
assert.equal(picked[0].name, "0010_SJ8_1404.jpg");
assert.deepEqual(sortFilesByName([{ name: "IMG_10.jpg" }, { name: "IMG_2.jpg" }]).map(({ name }) => name), ["IMG_2.jpg", "IMG_10.jpg"]);
const first = { name: "same.jpg", id: 1 };
const second = { name: "same.jpg", id: 2 };
assert.deepEqual(sortFilesByName([first, second]).map(({ id }) => id), [1, 2]);
console.log("filename-order ok");
