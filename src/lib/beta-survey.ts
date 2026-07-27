/**
 * 베타 서비스 내 설문(plan/beta-system.md §7) 관련 타입/상수의 단일 소스.
 * link_sent(①, "셀렉 링크 전달 후")는 §8.3 기준으로 식별자만 미리 정해져 있고
 * 문항이 아직 미확정이라 트리거를 구현하지 않았다 — 대신 첫 프로젝트 진행 중
 * 3개 지점(생성 후/원본 업로드 후/셀렉 회신받았을 때)에 1~2문항짜리 마이크로 설문을 둔다.
 */

export type SurveyType =
  | "link_sent"
  | "project_created"
  | "original_uploaded"
  | "selection_received"
  | "first_delivery"
  | "second_delivery";

/** 실제로 트리거/문항이 구현된 설문 타입만 여기 추가한다. 생애주기 순서로 정렬 — 여러 개가 동시에 조건 충족돼도 가장 이른 것부터 노출된다. */
export const IMPLEMENTED_SURVEY_TYPES: SurveyType[] = [
  "project_created",
  "original_uploaded",
  "selection_received",
  "first_delivery",
  "second_delivery",
];

/** "나중에" 클릭 시 재노출을 억제하는 시간(§7.2) */
export const SURVEY_LATER_COOLDOWN_HOURS = 24;

/**
 * 5점 척도 문항 공통 타입 — 문항마다 UI 라벨은 다르지만 값은 항상
 * "1=부정/이탈 ~ 5=긍정/유지"로 극성을 통일해 숫자로 저장한다(평균 등 정량 분석 목적).
 */
export type FivePointScale = 1 | 2 | 3 | 4 | 5;

export type HelpfulFeature =
  | "select_link"
  | "compare_original_edited"
  | "retouch_request"
  | "customer_convenience"
  | "other";

/** 생성 직후 마이크로 설문(1문항) */
export interface ProjectCreatedSurveyAnswers {
  /** 프로젝트 생성 과정이 얼마나 쉬웠는지(1=많이 헤맸다 ~ 5=아주 쉬웠다) */
  easeScale: FivePointScale;
}

/** 원본 업로드 완료 후 마이크로 설문(2문항) */
export interface OriginalUploadedSurveyAnswers {
  /** 업로드 과정이 얼마나 수월했는지(1~5) */
  uploadEaseScale: FivePointScale;
  /** 불편했던 점, 선택 입력 */
  inconvenience?: string;
}

/** 고객 셀렉 회신(확정) 직후 마이크로 설문(2문항) */
export interface SelectionReceivedSurveyAnswers {
  /** 고객 셀렉 결과를 확인하는 과정이 얼마나 편리했는지(1~5) */
  reviewEaseScale: FivePointScale;
  /** 고객에게 들은 의견/불편사항, 선택 입력 */
  customerFeedback?: string;
}

export interface FirstDeliverySurveyAnswers {
  /** 1. 실제 고객에게 사용했는지(테스트 목적 응답과 구분) */
  usedWithRealCustomer: boolean;
  /** 2. 기존 방식 대비 작업 시간 절감 체감(1=거의 차이 없음 ~ 5=매우 많이 줄었다) */
  timeSavedScale: FivePointScale;
  /** 3. 가장 도움이 된 기능(복수선택, 최소 1개) */
  helpfulFeatures: HelpfulFeature[];
  /** helpfulFeatures에 "other" 포함 시 필수 */
  helpfulFeaturesOther?: string;
  /** 4. 가장 불편했던 점, 선택 입력 */
  biggestInconvenience?: string;
  /** 5. 다음 프로젝트에서도 사용할 계획(1=전혀 없다 ~ 5=매우 그렇다) — 조기 이탈 예측 */
  willUseNextProject: FivePointScale;
}

export type PriceRange = "under_5k" | "5k_10k" | "10k_30k" | "30k_50k" | "over_50k" | "no_paid_intent";

export interface SecondDeliverySurveyAnswers {
  /** 1. 앞으로도 계속 사용할 의향(1~5) */
  continueUsingIntent: FivePointScale;
  /** 2. 추천 의향(NPS), 0~10 */
  npsScore: number;
  /** 3. 서비스가 사라지면 얼마나 아쉬울지(PMF 문항, Sean Ellis test, 1=전혀 아쉽지 않다 ~ 5=매우 아쉽다) */
  painIfGone: FivePointScale;
  /** 4. 적정 가격(구간 선택) */
  priceRange: PriceRange;
  /** 5. 유료 출시 시에도 계속 사용할 의향(1~5) */
  subscribeIntentIfPaid: FivePointScale;
  /** 6. 가장 추가되었으면 하는 기능, 선택 입력 */
  desiredFeature?: string;
  /** 7. 기타 의견, 선택 입력 */
  otherFeedback?: string;
  /** 8. 정식 출시 시 먼저 안내받고 싶은지(체크박스, 마지막 문항, 구매 의향 검증용) */
  wantsLaunchNotice: boolean;
}

export interface BetaSurveyStatusResponse {
  surveyType: SurveyType | null;
}
