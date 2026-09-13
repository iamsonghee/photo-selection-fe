export type ReviewSubmissionItem = {
  photo_version_id: string;
  photo_id: string;
  status: "approved" | "revision_requested";
  customer_comment?: string | null;
};

type ExpectedReviewItem = {
  photoVersionId: string;
  photoId: string;
};

export type ReviewSubmissionValidation =
  | { ok: true; reviews: ReviewSubmissionItem[] }
  | { ok: false; error: string };

const SINGLE_HANGUL_JAMO = /^[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]$/u;
const ONLY_BROKEN_GLYPHS = /^[\s□■▪▫·ㆍ└┗┕┖─—_+\-=�]+$/u;

/** 고객 코멘트의 공백을 정리하고 우발적인 한글 자모 한 글자를 제거한다. */
export function normalizeReviewComment(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().replace(/\s+/g, " ").slice(0, 100);
  if (
    !normalized ||
    SINGLE_HANGUL_JAMO.test(normalized) ||
    ONLY_BROKEN_GLYPHS.test(normalized)
  ) return null;
  return normalized;
}

/** 고객 제출이 현재 검토 대상 전체와 정확히 일치하는지 검증한다. */
export function validateReviewSubmission(
  input: unknown,
  expected: ExpectedReviewItem[],
): ReviewSubmissionValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "reviews array required" };
  }

  const expectedByVersionId = new Map(
    expected.map((item) => [item.photoVersionId, item.photoId]),
  );
  if (expectedByVersionId.size === 0 || input.length !== expectedByVersionId.size) {
    return { ok: false, error: "모든 보정본의 검토 결과를 제출해 주세요." };
  }

  const seen = new Set<string>();
  const reviews: ReviewSubmissionItem[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") {
      return { ok: false, error: "Invalid reviews format" };
    }
    const item = value as Record<string, unknown>;
    const comment = item.customer_comment;
    if (
      typeof item.photo_version_id !== "string" ||
      typeof item.photo_id !== "string" ||
      (item.status !== "approved" && item.status !== "revision_requested") ||
      (comment !== undefined && comment !== null && typeof comment !== "string") ||
      (typeof comment === "string" && comment.length > 100)
    ) {
      return { ok: false, error: "Invalid reviews format" };
    }

    if (seen.has(item.photo_version_id)) {
      return { ok: false, error: "중복된 보정본 검토 항목이 있습니다." };
    }
    seen.add(item.photo_version_id);

    if (expectedByVersionId.get(item.photo_version_id) !== item.photo_id) {
      return {
        ok: false,
        error: "일부 보정본 ID가 이 프로젝트와 일치하지 않습니다. 페이지를 새로고침 후 다시 제출해 주세요.",
      };
    }

    reviews.push({
      photo_version_id: item.photo_version_id,
      photo_id: item.photo_id,
      status: item.status,
      customer_comment: normalizeReviewComment(comment),
    });
  }

  return { ok: true, reviews };
}
