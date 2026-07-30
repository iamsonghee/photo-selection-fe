"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Button, Card } from "@/components/ui";
import { AuthModal } from "@/components/AuthModal";
import {
  BETA_GENRE_OPTIONS,
  BETA_MONTHLY_PROJECT_OPTIONS,
  BETA_AVG_PHOTOS_OPTIONS,
  BETA_WORKFLOW_OPTIONS,
  BETA_DESIRED_FEATURE_OPTIONS,
  BETA_PAIN_POINT_OPTIONS,
  BETA_USAGE_INTENT_OPTIONS,
  BETA_CONTACT_CHANNEL_OPTIONS,
  type BetaOption,
} from "@/lib/beta-application";

/** 로그인 안 된 상태에서 /beta/apply에 접근했을 때 노출 — 로그인 후에만 신청서를 받는다(§3.1). */
function BetaApplySignInPrompt() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">A-CUT 클로즈드 베타 신청</h1>
      <p className="text-sm text-muted-foreground">
        베타 신청은 로그인 후 진행할 수 있습니다.
        <br />
        구글 또는 카카오 계정으로 로그인해주세요.
      </p>
      <Button onClick={() => setAuthOpen(true)} fullWidth>
        로그인하고 신청하기
      </Button>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectPath="/beta/apply" />
    </Card>
  );
}

export function BetaApplyForm({ prefillEmail }: { prefillEmail: string | null }) {
  if (!prefillEmail) return <BetaApplySignInPrompt />;
  return <BetaApplyFormFields email={prefillEmail} />;
}

// ── 선택형 UI 프리미티브 ─────────────────────────────────────────────────────

function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-4 rounded-lg border text-sm font-medium transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-surface-raised text-foreground hover:bg-border-strong"
      }`}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}

function MultiSelectField({
  label,
  hint,
  options,
  values,
  onChange,
  otherKey = "other",
  otherValue,
  onOtherChange,
}: {
  label: string;
  hint?: string;
  options: readonly BetaOption[];
  values: string[];
  onChange: (next: string[]) => void;
  otherKey?: string;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
}) {
  const toggle = (key: string) => {
    onChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);
  };
  const hasOther = options.some((o) => o.key === otherKey);
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <OptionChip key={o.key} label={o.label} selected={values.includes(o.key)} onClick={() => toggle(o.key)} />
        ))}
      </div>
      {hasOther && values.includes(otherKey) && onOtherChange && (
        <Input
          className="mt-2"
          value={otherValue ?? ""}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="기타 내용을 입력해주세요"
        />
      )}
    </div>
  );
}

function SingleSelectField({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly BetaOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <OptionChip key={o.key} label={o.label} selected={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
    </div>
  );
}

// ── 메인 폼 ──────────────────────────────────────────────────────────────────

function BetaApplyFormFields({ email }: { email: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [genres, setGenres] = useState<string[]>([]);
  const [genreOther, setGenreOther] = useState("");
  const [monthlyProjectRange, setMonthlyProjectRange] = useState("");
  const [avgPhotosRange, setAvgPhotosRange] = useState("");
  const [workflowMethods, setWorkflowMethods] = useState<string[]>([]);
  const [workflowOther, setWorkflowOther] = useState("");
  const [desiredFeatures, setDesiredFeatures] = useState<string[]>([]);
  const [desiredFeaturesOther, setDesiredFeaturesOther] = useState("");

  const [painPoint, setPainPoint] = useState("");
  const [usageIntent, setUsageIntent] = useState("");
  const [contactChannels, setContactChannels] = useState<string[]>([]);
  const [expectation, setExpectation] = useState("");

  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function validate(): string | null {
    if (!name.trim()) return "이름을 입력해주세요.";
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone.trim())) return "휴대폰번호 형식이 올바르지 않습니다.";
    if (genres.length === 0) return "주 촬영 분야를 선택해주세요.";
    if (genres.includes("other") && !genreOther.trim()) return "기타 촬영 분야를 입력해주세요.";
    if (!monthlyProjectRange) return "월평균 프로젝트 수를 선택해주세요.";
    if (!avgPhotosRange) return "프로젝트당 평균 사진 수를 선택해주세요.";
    if (workflowMethods.length === 0) return "현재 고객 셀렉 방식을 선택해주세요.";
    if (workflowMethods.includes("other") && !workflowOther.trim()) return "기타 셀렉 방식을 입력해주세요.";
    if (desiredFeatures.length === 0) return "베타에서 사용해보고 싶은 기능을 선택해주세요.";
    if (desiredFeatures.includes("other") && !desiredFeaturesOther.trim())
      return "기타 희망 기능을 입력해주세요.";
    if (!privacyConsent) return "개인정보 수집·이용에 동의해주세요.";
    if (!contactConsent) return "베타 운영 관련 연락에 동의해주세요.";
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/beta/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          genres,
          genre_other: genreOther.trim() || undefined,
          monthly_project_range: monthlyProjectRange,
          avg_photos_range: avgPhotosRange,
          workflow_methods: workflowMethods,
          workflow_other: workflowOther.trim() || undefined,
          desired_features: desiredFeatures,
          desired_features_other: desiredFeaturesOther.trim() || undefined,
          pain_point: painPoint || undefined,
          usage_intent: usageIntent || undefined,
          contact_channels: contactChannels.length > 0 ? contactChannels : undefined,
          expectation: expectation.trim() || undefined,
          privacy_consent: privacyConsent,
          contact_consent: contactConsent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "신청에 실패했습니다. 다시 시도해주세요.");
      }

      router.push("/beta/apply/complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">A-CUT 클로즈드 베타 신청</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          약 1~2분이면 끝나요. 신청서를 검토한 뒤 입력하신 번호로 직접 연락드립니다.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">이메일</p>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>

      <Input label="이름 *" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
      <Input
        label="휴대폰번호 *"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="010-1234-5678"
        inputMode="tel"
      />

      <MultiSelectField
        label="주 촬영 분야 * (복수선택 가능)"
        options={BETA_GENRE_OPTIONS}
        values={genres}
        onChange={setGenres}
        otherValue={genreOther}
        onOtherChange={setGenreOther}
      />

      <SingleSelectField
        label="월평균 프로젝트 수 *"
        options={BETA_MONTHLY_PROJECT_OPTIONS}
        value={monthlyProjectRange}
        onChange={setMonthlyProjectRange}
      />

      <SingleSelectField
        label="프로젝트당 평균 사진 수 *"
        options={BETA_AVG_PHOTOS_OPTIONS}
        value={avgPhotosRange}
        onChange={setAvgPhotosRange}
      />

      <MultiSelectField
        label="현재 고객 셀렉 방식은 어떻게 진행하시나요? * (복수선택 가능)"
        options={BETA_WORKFLOW_OPTIONS}
        values={workflowMethods}
        onChange={setWorkflowMethods}
        otherValue={workflowOther}
        onOtherChange={setWorkflowOther}
      />

      <MultiSelectField
        label="베타에서 사용해보고 싶은 기능은? * (복수선택 가능)"
        options={BETA_DESIRED_FEATURE_OPTIONS}
        values={desiredFeatures}
        onChange={setDesiredFeatures}
        otherValue={desiredFeaturesOther}
        onOtherChange={setDesiredFeaturesOther}
      />

      <div className="h-px bg-border" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">선택 입력</p>

      <SingleSelectField
        label="가장 불편한 단계"
        options={BETA_PAIN_POINT_OPTIONS}
        value={painPoint}
        onChange={setPainPoint}
      />

      <SingleSelectField
        label="월 사용 의향"
        options={BETA_USAGE_INTENT_OPTIONS}
        value={usageIntent}
        onChange={setUsageIntent}
      />

      <MultiSelectField
        label="연락 가능 채널 (복수선택 가능)"
        options={BETA_CONTACT_CHANNEL_OPTIONS}
        values={contactChannels}
        onChange={setContactChannels}
      />

      <Textarea
        label="A-CUT에 기대하는 점을 알려주세요"
        value={expectation}
        onChange={(e) => setExpectation(e.target.value)}
        rows={3}
        placeholder="선택 입력"
      />

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={privacyConsent}
          onChange={(e) => setPrivacyConsent(e.target.checked)}
          className="mt-0.5"
        />
        개인정보 수집·이용에 동의합니다 (필수)
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={contactConsent}
          onChange={(e) => setContactConsent(e.target.checked)}
          className="mt-0.5"
        />
        베타 운영 관련 연락(전화/문자)에 동의합니다 (필수)
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={submit} disabled={submitting} fullWidth>
        {submitting ? "제출 중…" : "베타 신청하기"}
      </Button>
    </Card>
  );
}
