import { test, expect } from "@playwright/test";
import { buildVersionMapping, stemFilename, normalizeFilename } from "../../../src/lib/version-mapping";

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
