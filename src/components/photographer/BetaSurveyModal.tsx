"use client";

import { useState } from "react";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { QuestionHeader, PointScaleField, RadioListField, ChipMultiSelectField, Textarea } from "@/components/ui";
import type {
  ProjectCreatedSurveyAnswers,
  OriginalUploadedSurveyAnswers,
  SelectionReceivedSurveyAnswers,
  FirstDeliverySurveyAnswers,
  SecondDeliverySurveyAnswers,
  FivePointScale,
  HelpfulFeature,
  PriceRange,
  SurveyType,
} from "@/lib/beta-survey";

const EASE_LABELS: Record<FivePointScale, string> = {
  1: "많이 헤맸다",
  2: "조금 헤맸다",
  3: "보통",
  4: "수월했다",
  5: "아주 수월했다",
};

const TIME_SAVED_LABELS: Record<FivePointScale, string> = {
  1: "거의 차이 없음",
  2: "조금 줄었다",
  3: "보통",
  4: "많이 줄었다",
  5: "매우 많이 줄었다",
};

const INTENT_LABELS: Record<FivePointScale, string> = {
  1: "전혀 없다",
  2: "아니다",
  3: "보통",
  4: "그렇다",
  5: "매우 그렇다",
};

const PAIN_IF_GONE_LABELS: Record<FivePointScale, string> = {
  1: "전혀 아쉽지 않다",
  2: "조금 아쉽다",
  3: "보통이다",
  4: "많이 아쉽다",
  5: "매우 아쉽다",
};

const HELPFUL_FEATURE_OPTIONS: { value: HelpfulFeature; label: string }[] = [
  { value: "select_link", label: "셀렉 링크" },
  { value: "compare_original_edited", label: "원본·보정본 비교" },
  { value: "retouch_request", label: "보정 요청" },
  { value: "customer_convenience", label: "고객 사용 편의성" },
  { value: "other", label: "기타" },
];

const PRICE_RANGE_OPTIONS: { value: PriceRange; label: string }[] = [
  { value: "under_5k", label: "월 5천원 미만" },
  { value: "5k_10k", label: "5천원~1만원" },
  { value: "10k_30k", label: "1만원~3만원" },
  { value: "30k_50k", label: "3만원~5만원" },
  { value: "over_50k", label: "5만원 이상" },
  { value: "no_paid_intent", label: "현재로서는 유료 이용 의향 없음" },
];

const NPS_SCORES = Array.from({ length: 11 }, (_, i) => i); // 0~10

const USED_WITH_REAL_CUSTOMER_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "예" },
  { value: false, label: "아니오" },
];

const TITLES: Record<SurveyType, string> = {
  link_sent: "",
  project_created: "프로젝트를 만드셨네요!",
  original_uploaded: "원본 업로드를 완료하셨네요!",
  selection_received: "고객이 셀렉을 완료했어요!",
  first_delivery: "첫 프로젝트를 완료하셨네요! 🎉",
  second_delivery: "두 번째 프로젝트도 완료하셨네요! 🎉",
};

const npsBtnCls = (active: boolean) =>
  `h-9 w-9 rounded-lg border text-sm transition-colors ${
    active
      ? "border-accent bg-accent/10 text-foreground"
      : "border-border text-muted-foreground hover:text-foreground"
  }`;

type Answers =
  | ProjectCreatedSurveyAnswers
  | OriginalUploadedSurveyAnswers
  | SelectionReceivedSurveyAnswers
  | FirstDeliverySurveyAnswers
  | SecondDeliverySurveyAnswers;

const IMPLEMENTED_MODAL_TYPES: SurveyType[] = [
  "project_created",
  "original_uploaded",
  "selection_received",
  "first_delivery",
  "second_delivery",
];

/**
 * 베타 설문 모달(plan/beta-system.md §7) — 범용 셸이며, surveyType별로 문항 블록이
 * 분기된다. 첫 프로젝트 진행 중 마이크로 설문 3종(생성 후/원본 업로드 후/셀렉 회신받았을
 * 때, 1~2문항)과 ②/③(프로젝트 완료 후, 5~8문항)까지 총 5개 타입이 구현돼 있다.
 * ①(셀렉 링크 전달 후)은 문항이 아직 미확정이라 트리거를 구현하지 않았다.
 */
export function BetaSurveyModal({
  surveyType,
  onDone,
}: {
  surveyType: SurveyType;
  onDone: () => void;
}) {
  // 생성 후 문항 상태
  const [easeScale, setEaseScale] = useState<FivePointScale | null>(null);

  // 원본 업로드 후 문항 상태
  const [uploadEaseScale, setUploadEaseScale] = useState<FivePointScale | null>(null);
  const [uploadInconvenience, setUploadInconvenience] = useState("");

  // 셀렉 회신받았을 때 문항 상태
  const [reviewEaseScale, setReviewEaseScale] = useState<FivePointScale | null>(null);
  const [customerFeedback, setCustomerFeedback] = useState("");

  // ② 문항 상태
  const [usedWithRealCustomer, setUsedWithRealCustomer] = useState<boolean | null>(null);
  const [timeSavedScale, setTimeSavedScale] = useState<FivePointScale | null>(null);
  const [helpfulFeatures, setHelpfulFeatures] = useState<HelpfulFeature[]>([]);
  const [helpfulFeaturesOther, setHelpfulFeaturesOther] = useState("");
  const [biggestInconvenience, setBiggestInconvenience] = useState("");
  const [willUseNextProject, setWillUseNextProject] = useState<FivePointScale | null>(null);

  // ③ 문항 상태
  const [continueUsingIntent, setContinueUsingIntent] = useState<FivePointScale | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [painIfGone, setPainIfGone] = useState<FivePointScale | null>(null);
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null);
  const [subscribeIntentIfPaid, setSubscribeIntentIfPaid] = useState<FivePointScale | null>(null);
  const [desiredFeature, setDesiredFeature] = useState("");
  const [otherFeedback, setOtherFeedback] = useState("");
  const [wantsLaunchNotice, setWantsLaunchNotice] = useState(false);

  const [pending, setPending] = useState<null | "submit" | "later" | "skip">(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function postAction(action: "submit" | "later", answers?: Answers) {
    const res = await fetch("/api/photographer/beta-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyType, action, answers }),
    });
    if (!res.ok) throw new Error();
  }

  async function handleLater() {
    setPending("later");
    setError("");
    try {
      await postAction("later");
      onDone();
    } catch {
      setError("처리에 실패했습니다. 다시 시도해주세요.");
      setPending(null);
    }
  }

  async function handleSkip() {
    setPending("skip");
    setError("");
    try {
      const res = await fetch("/api/photographer/beta-survey/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyType }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      setError("처리에 실패했습니다. 다시 시도해주세요.");
      setPending(null);
    }
  }

  async function handleSubmitProjectCreated() {
    if (!easeScale) {
      setError("문항에 응답해주세요.");
      return;
    }
    setPending("submit");
    setError("");
    try {
      await postAction("submit", { easeScale });
      setDone(true);
    } catch {
      setError("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  }

  async function handleSubmitOriginalUploaded() {
    if (!uploadEaseScale) {
      setError("문항에 응답해주세요.");
      return;
    }
    setPending("submit");
    setError("");
    try {
      await postAction("submit", {
        uploadEaseScale,
        inconvenience: uploadInconvenience.trim() || undefined,
      });
      setDone(true);
    } catch {
      setError("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  }

  async function handleSubmitSelectionReceived() {
    if (!reviewEaseScale) {
      setError("문항에 응답해주세요.");
      return;
    }
    setPending("submit");
    setError("");
    try {
      await postAction("submit", {
        reviewEaseScale,
        customerFeedback: customerFeedback.trim() || undefined,
      });
      setDone(true);
    } catch {
      setError("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  }

  async function handleSubmitFirstDelivery() {
    if (usedWithRealCustomer === null || !timeSavedScale || helpfulFeatures.length === 0 || !willUseNextProject) {
      setError("문항에 응답해주세요.");
      return;
    }
    if (helpfulFeatures.includes("other") && !helpfulFeaturesOther.trim()) {
      setError("기타 내용을 입력해주세요.");
      return;
    }
    setPending("submit");
    setError("");
    try {
      await postAction("submit", {
        usedWithRealCustomer,
        timeSavedScale,
        helpfulFeatures,
        helpfulFeaturesOther: helpfulFeatures.includes("other") ? helpfulFeaturesOther.trim() : undefined,
        biggestInconvenience: biggestInconvenience.trim() || undefined,
        willUseNextProject,
      });
      setDone(true);
    } catch {
      setError("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  }

  async function handleSubmitSecondDelivery() {
    if (!continueUsingIntent || npsScore === null || !painIfGone || !priceRange || !subscribeIntentIfPaid) {
      setError("문항에 응답해주세요.");
      return;
    }
    setPending("submit");
    setError("");
    try {
      await postAction("submit", {
        continueUsingIntent,
        npsScore,
        painIfGone,
        priceRange,
        subscribeIntentIfPaid,
        desiredFeature: desiredFeature.trim() || undefined,
        otherFeedback: otherFeedback.trim() || undefined,
        wantsLaunchNotice,
      });
      setDone(true);
    } catch {
      setError("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setPending(null);
    }
  }

  if (!IMPLEMENTED_MODAL_TYPES.includes(surveyType)) return null;

  const SUBMIT_HANDLERS: Record<string, () => Promise<void>> = {
    project_created: handleSubmitProjectCreated,
    original_uploaded: handleSubmitOriginalUploaded,
    selection_received: handleSubmitSelectionReceived,
    first_delivery: handleSubmitFirstDelivery,
    second_delivery: handleSubmitSecondDelivery,
  };
  const handleSubmit = SUBMIT_HANDLERS[surveyType];

  return (
    <PhotographerModal open onClose={handleLater} title={TITLES[surveyType]} maxWidth={480}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">소중한 의견 감사합니다!</p>
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black"
          >
            닫기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {surveyType === "project_created" && (
            <div>
              <QuestionHeader title="A-CUT 프로젝트 생성 과정, 어렵지 않으셨나요?" />
              <PointScaleField name="easeScale" labels={EASE_LABELS} value={easeScale} onChange={setEaseScale} />
            </div>
          )}

          {surveyType === "original_uploaded" && (
            <>
              <div>
                <QuestionHeader title="원본 사진 업로드 과정이 수월하셨나요?" />
                <PointScaleField
                  name="uploadEaseScale"
                  labels={EASE_LABELS}
                  value={uploadEaseScale}
                  onChange={setUploadEaseScale}
                />
              </div>
              <div>
                <QuestionHeader title="혹시 불편했던 점이 있다면 알려주세요" />
                <Textarea
                  value={uploadInconvenience}
                  onChange={(e) => setUploadInconvenience(e.target.value)}
                  rows={2}
                  placeholder="선택 입력"
                  className="min-h-0 resize-none [word-break:keep-all]"
                />
              </div>
            </>
          )}

          {surveyType === "selection_received" && (
            <>
              <div>
                <QuestionHeader title="고객의 셀렉 결과를 확인하는 과정이 편리했나요?" />
                <PointScaleField
                  name="reviewEaseScale"
                  labels={EASE_LABELS}
                  value={reviewEaseScale}
                  onChange={setReviewEaseScale}
                />
              </div>
              <div>
                <QuestionHeader title="고객에게 들은 의견이나 불편사항이 있다면 알려주세요" />
                <Textarea
                  value={customerFeedback}
                  onChange={(e) => setCustomerFeedback(e.target.value)}
                  rows={2}
                  placeholder="선택 입력"
                  className="min-h-0 resize-none [word-break:keep-all]"
                />
              </div>
            </>
          )}

          {surveyType === "first_delivery" && (
            <>
              <div>
                <QuestionHeader title="이번 프로젝트에 A-CUT을 실제 고객에게 사용하셨나요?" />
                <RadioListField
                  name="usedWithRealCustomer"
                  options={USED_WITH_REAL_CUSTOMER_OPTIONS}
                  value={usedWithRealCustomer}
                  onChange={setUsedWithRealCustomer}
                />
              </div>

              <div>
                <QuestionHeader title="기존 방식보다 작업 시간이 얼마나 줄었다고 느끼셨나요?" />
                <PointScaleField
                  name="timeSavedScale"
                  labels={TIME_SAVED_LABELS}
                  value={timeSavedScale}
                  onChange={setTimeSavedScale}
                />
              </div>

              <div>
                <QuestionHeader title="가장 도움이 되었던 기능은 무엇인가요?" />
                <ChipMultiSelectField
                  options={HELPFUL_FEATURE_OPTIONS}
                  values={helpfulFeatures}
                  onChange={setHelpfulFeatures}
                  otherOptionValue="other"
                  otherValue={helpfulFeaturesOther}
                  onOtherChange={setHelpfulFeaturesOther}
                  otherPlaceholder="어떤 기능이었나요?"
                />
              </div>

              <div>
                <QuestionHeader title="사용하면서 가장 불편했던 점은 무엇이었나요?" />
                <Textarea
                  value={biggestInconvenience}
                  onChange={(e) => setBiggestInconvenience(e.target.value)}
                  rows={3}
                  placeholder="선택 입력"
                  className="min-h-0 resize-none [word-break:keep-all]"
                />
              </div>

              <div>
                <QuestionHeader title="다음 프로젝트에서도 A-CUT을 사용할 계획이 있으신가요?" />
                <PointScaleField
                  name="willUseNextProject"
                  labels={INTENT_LABELS}
                  value={willUseNextProject}
                  onChange={setWillUseNextProject}
                />
              </div>
            </>
          )}

          {surveyType === "second_delivery" && (
            <>
              <div>
                <QuestionHeader title="앞으로도 A-CUT을 계속 사용할 의향이 있으신가요?" />
                <PointScaleField
                  name="continueUsingIntent"
                  labels={INTENT_LABELS}
                  value={continueUsingIntent}
                  onChange={setContinueUsingIntent}
                />
              </div>

              <div>
                <QuestionHeader
                  title="동료 작가에게 추천할 가능성은 얼마나 되나요?"
                  hint="0 = 전혀 아니다, 10 = 매우 그렇다"
                />
                <div className="flex flex-wrap gap-1.5">
                  {NPS_SCORES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNpsScore(n)}
                      aria-pressed={npsScore === n}
                      className={npsBtnCls(npsScore === n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <QuestionHeader title="A-CUT이 없어진다면 얼마나 아쉬울 것 같나요?" />
                <PointScaleField
                  name="painIfGone"
                  labels={PAIN_IF_GONE_LABELS}
                  value={painIfGone}
                  onChange={setPainIfGone}
                />
              </div>

              <div>
                <QuestionHeader title="정식 출시 시 적정한 월 이용료는 얼마라고 생각하시나요?" />
                <RadioListField
                  name="priceRange"
                  options={PRICE_RANGE_OPTIONS}
                  value={priceRange}
                  onChange={setPriceRange}
                />
              </div>

              <div>
                <QuestionHeader title="유료로 출시되어도 계속 사용할 의향이 있으신가요?" />
                <PointScaleField
                  name="subscribeIntentIfPaid"
                  labels={INTENT_LABELS}
                  value={subscribeIntentIfPaid}
                  onChange={setSubscribeIntentIfPaid}
                />
              </div>

              <div>
                <QuestionHeader title="가장 추가되었으면 하는 기능이 있다면?" />
                <Textarea
                  value={desiredFeature}
                  onChange={(e) => setDesiredFeature(e.target.value)}
                  rows={2}
                  placeholder="선택 입력"
                  className="min-h-0 resize-none [word-break:keep-all]"
                />
              </div>

              <div>
                <QuestionHeader title="기타 의견" />
                <Textarea
                  value={otherFeedback}
                  onChange={(e) => setOtherFeedback(e.target.value)}
                  rows={2}
                  placeholder="선택 입력"
                  className="min-h-0 resize-none [word-break:keep-all]"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-border px-3.5 py-3 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsLaunchNotice}
                  onChange={(e) => setWantsLaunchNotice(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="[word-break:keep-all] leading-relaxed">정식 출시 시 먼저 안내받고 싶으신가요?</span>
              </label>
            </>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleSkip}
              disabled={pending !== null}
              className="text-xs text-disabled-foreground underline underline-offset-2 hover:text-muted-foreground disabled:opacity-50"
            >
              다시 묻지 않기
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLater}
                disabled={pending !== null}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending !== null}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {pending === "submit" ? "제출 중…" : "제출"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PhotographerModal>
  );
}
