import { test, expect } from "@playwright/test";
import {
  applySequentialFallback,
  buildVersionMapping,
  stemFilename,
  normalizeFilename,
  type MappingResult,
  type MappingTarget,
} from "../../../src/lib/version-mapping";

/**
 * BUG-02 회귀 테스트: 보정본 파일명의 3자리 이상 순번(예: E2E_TEST_001)이
 * "_v1" 같은 버전 표기와 혼동되어 서로 다른 사진끼리 잘못 매칭되던 문제.
 * 순수 함수 테스트이므로 브라우저/서버 없이 동작한다.
 */
test.describe("version-mapping — 파일명 매칭 (BUG-02 회귀)", () => {
  test("3자리 순번 파일명은 stem이 서로 구분된다", () => {
    expect(stemFilename(normalizeFilename("E2E_TEST_001.jpg"))).toBe("e2e_test_001");
    expect(stemFilename(normalizeFilename("E2E_TEST_002.jpg"))).toBe("e2e_test_002");
    expect(stemFilename(normalizeFilename("E2E_TEST_003.jpg"))).toBe("e2e_test_003");
  });

  test("003용 보정본 파일 하나만 업로드해도 003 사진에만 매칭된다(001/002는 미매칭 유지)", () => {
    const targets = [
      { id: "p1", filename: "E2E_TEST_001.jpg" },
      { id: "p2", filename: "E2E_TEST_002.jpg" },
      { id: "p3", filename: "E2E_TEST_003.jpg" },
    ];
    const file = new File([], "E2E_TEST_003-Edit.jpg");
    const mapping = buildVersionMapping([file], targets);

    const p1 = mapping.find((m) => m.target.id === "p1")!;
    const p2 = mapping.find((m) => m.target.id === "p2")!;
    const p3 = mapping.find((m) => m.target.id === "p3")!;

    expect(p1.file).toBeNull();
    expect(p2.file).toBeNull();
    expect(p3.file).toBe(file);
    expect(p3.type).toBe("fuzzy");
  });

  test("버전 표기(_v1, _v2)와 짧은 변형 번호(_1, _2)는 여전히 stem에서 제거된다", () => {
    expect(stemFilename(normalizeFilename("DSC_0001_v1_final.jpg"))).toBe("dsc_0001");
    expect(stemFilename(normalizeFilename("photo_1.jpg"))).toBe("photo");
    expect(stemFilename(normalizeFilename("photo-2.jpg"))).toBe("photo");
  });

  test("Lightroom -Edit 접미사를 제거해도 원본 순번은 보존된다", () => {
    expect(stemFilename(normalizeFilename("DSC_0001-Edit.jpg"))).toBe("dsc_0001");
  });
});

/**
 * 순차(order) 폴백: exact/fuzzy/CLIP 매칭에도 실패한 잔여 항목을 잔여 파일과
 * 순서대로 짝짓는 최후 단계. 매칭 근거가 없으므로 반드시 "order" 타입으로 표시된다.
 */
test.describe("version-mapping — 순차 폴백 매칭 (applySequentialFallback)", () => {
  function noneRows(ids: string[]): MappingResult<MappingTarget>[] {
    return ids.map((id) => ({ target: { id, filename: `${id}.jpg` }, file: null, type: "none" as const }));
  }

  test("잔여 타깃 3개 + 잔여 파일 2개 → 앞 2개만 순서대로 매칭, 3번째는 미매칭 유지", () => {
    const rows = noneRows(["p1", "p2", "p3"]);
    const fileA = new File([], "random-a.jpg");
    const fileB = new File([], "random-b.jpg");
    const result = applySequentialFallback(rows, [fileA, fileB]);

    expect(result.find((r) => r.target.id === "p1")).toMatchObject({ file: fileA, type: "order" });
    expect(result.find((r) => r.target.id === "p2")).toMatchObject({ file: fileB, type: "order" });
    expect(result.find((r) => r.target.id === "p3")).toMatchObject({ file: null, type: "none" });
  });

  test("잔여 타깃 2개 + 잔여 파일 3개 → 2개만 매칭, 1개 파일은 미사용으로 남는다", () => {
    const rows = noneRows(["p1", "p2"]);
    const files = [new File([], "a.jpg"), new File([], "b.jpg"), new File([], "c.jpg")];
    const result = applySequentialFallback(rows, files);

    expect(result.find((r) => r.target.id === "p1")).toMatchObject({ file: files[0], type: "order" });
    expect(result.find((r) => r.target.id === "p2")).toMatchObject({ file: files[1], type: "order" });
    // 3번째 파일(files[2])은 어느 행에도 배정되지 않음 — 반환값에는 타깃 행만 있으므로
    // 소비된 파일 수만 확인한다.
    expect(result.every((r) => r.file !== files[2])).toBe(true);
  });

  test("이미 exact/fuzzy/clip로 매칭된 행은 건드리지 않는다", () => {
    const exactFile = new File([], "matched.jpg");
    const rows: MappingResult<MappingTarget>[] = [
      { target: { id: "p1", filename: "p1.jpg" }, file: exactFile, type: "exact" },
      { target: { id: "p2", filename: "p2.jpg" }, file: null, type: "none" },
    ];
    const fallbackFile = new File([], "fallback.jpg");
    const result = applySequentialFallback(rows, [fallbackFile]);

    expect(result.find((r) => r.target.id === "p1")).toMatchObject({ file: exactFile, type: "exact" });
    expect(result.find((r) => r.target.id === "p2")).toMatchObject({ file: fallbackFile, type: "order" });
  });
});
