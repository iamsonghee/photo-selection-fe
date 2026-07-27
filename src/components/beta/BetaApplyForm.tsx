"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Button, Card } from "@/components/ui";
import { AuthModal } from "@/components/AuthModal";
import { BETA_APPLICATION_GENRES } from "@/lib/beta-application";

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

function BetaApplyFormFields({ email }: { email: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [monthlyShootCount, setMonthlyShootCount] = useState("");
  const [avgPhotosPerProject, setAvgPhotosPerProject] = useState("");
  const [currentWorkflow, setCurrentWorkflow] = useState("");
  const [reason, setReason] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function validate(): string | null {
    if (!name.trim()) return "이름을 입력해주세요.";
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone.trim())) return "휴대폰번호 형식이 올바르지 않습니다.";
    if (!genre) return "촬영 장르를 선택해주세요.";
    if (!monthlyShootCount.trim() || Number(monthlyShootCount) < 0) return "월평균 촬영 건수를 확인해주세요.";
    if (!avgPhotosPerProject.trim() || Number(avgPhotosPerProject) < 0)
      return "프로젝트당 평균 전달 사진 수를 확인해주세요.";
    if (!currentWorkflow.trim()) return "현재 셀렉·보정 요청 전달 방식을 입력해주세요.";
    if (!reason.trim()) return "A-CUT을 사용해보고 싶은 이유를 입력해주세요.";
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
          genre,
          monthly_shoot_count: Number(monthlyShootCount),
          avg_photos_per_project: Number(avgPhotosPerProject),
          current_workflow: currentWorkflow.trim(),
          reason: reason.trim(),
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
    <Card className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">A-CUT 클로즈드 베타 신청</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          신청서를 검토한 뒤 입력하신 번호로 직접 연락드립니다.
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

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">촬영 장르 *</label>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-surface-raised px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">선택해주세요</option>
          {BETA_APPLICATION_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="월평균 촬영 건수 *"
        type="number"
        min={0}
        value={monthlyShootCount}
        onChange={(e) => setMonthlyShootCount(e.target.value)}
        placeholder="예: 4"
      />
      <Input
        label="프로젝트당 평균 전달 사진 수 *"
        type="number"
        min={0}
        value={avgPhotosPerProject}
        onChange={(e) => setAvgPhotosPerProject(e.target.value)}
        placeholder="예: 350"
      />
      <Textarea
        label="현재 셀렉·보정 요청은 어떻게 진행하시나요? *"
        value={currentWorkflow}
        onChange={(e) => setCurrentWorkflow(e.target.value)}
        placeholder="예: 구글드라이브 링크 + 카톡으로 회신"
        rows={3}
      />
      <Textarea
        label="A-CUT을 써보고 싶은 이유를 알려주세요 *"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
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
