import { test, expect } from "@playwright/test";
import {
  normalizeReviewComment,
  validateReviewSubmission,
} from "../../../src/lib/review-submission-validation";

const expected = [
  { photoVersionId: "version-1", photoId: "photo-1" },
  { photoVersionId: "version-2", photoId: "photo-2" },
];

const validReviews = [
  { photo_version_id: "version-1", photo_id: "photo-1", status: "approved" as const },
  { photo_version_id: "version-2", photo_id: "photo-2", status: "revision_requested" as const },
];

test.describe("고객 검토 제출 검증", () => {
  test("현재 검토 대상 전체와 정확히 일치하면 허용", () => {
    expect(validateReviewSubmission(validReviews, expected).ok).toBe(true);
  });

  test("일부 사진만 제출하면 거부", () => {
    const result = validateReviewSubmission(validReviews.slice(0, 1), expected);
    expect(result).toEqual({ ok: false, error: "모든 보정본의 검토 결과를 제출해 주세요." });
  });

  test("photo_version_id와 photo_id 짝이 다르면 거부", () => {
    const result = validateReviewSubmission([
      { ...validReviews[0], photo_id: "photo-2" },
      validReviews[1],
    ], expected);
    expect(result.ok).toBe(false);
  });

  test("같은 보정본을 중복 제출하면 400용 검증 오류로 거부", () => {
    const result = validateReviewSubmission([
      validReviews[0],
      { ...validReviews[0] },
    ], expected);
    expect(result).toEqual({ ok: false, error: "중복된 보정본 검토 항목이 있습니다." });
  });

  test("100자를 초과한 코멘트는 거부", () => {
    const result = validateReviewSubmission([
      { ...validReviews[0], customer_comment: "가".repeat(101) },
      validReviews[1],
    ], expected);
    expect(result).toEqual({ ok: false, error: "Invalid reviews format" });
  });

  test("코멘트 공백을 정리", () => {
    expect(normalizeReviewComment("  얼굴의   붉은 기를 줄여주세요  ")).toBe(
      "얼굴의 붉은 기를 줄여주세요",
    );
  });

  test("우발적인 한글 자모 한 글자는 미입력으로 처리", () => {
    expect(normalizeReviewComment("ㄴ")).toBeNull();
    expect(normalizeReviewComment(" ㅁ ")).toBeNull();
  });

  test("제출 시 단일 자모 코멘트를 저장하지 않음", () => {
    const result = validateReviewSubmission([
      { ...validReviews[0], customer_comment: "ㄴ" },
      validReviews[1],
    ], expected);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reviews[0].customer_comment).toBeNull();
  });
});
