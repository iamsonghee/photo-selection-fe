"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PROJECT_FORM_INPUT_CLASS, ProjectFormDateInput, ProjectFormField, ProjectFormInput, ProjectFormPageHeading, ProjectFormSection, ProjectFormTextarea, projectFormInputStateClass } from "@/components/photographer/ProjectFormFields";
import { CEREMONY_TIMES, DEFAULT_GUEST_GREETING, GUEST_GREETING_MAX as GREETING_MAX, formatCeremonyTime, formatWeddingDateTime, retentionEndDate } from "@/lib/guest-album";

export function NewGuestAlbumForm({ retentionDays }: { retentionDays: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [ceremonyTime, setCeremonyTime] = useState("");
  const [venue, setVenue] = useState("");
  const [greeting, setGreeting] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (submitting) return;
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "앨범 이름을 입력해 주세요.";
    if (!weddingDate) errors.weddingDate = "결혼식 날짜를 골라 주세요.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      requestAnimationFrame(() => document.getElementById(`field-${Object.keys(errors)[0]}`)?.querySelector<HTMLElement>("input")?.focus());
      return;
    }
    // 지난 날짜도 받는다(식이 끝난 뒤 만드는 경우). 보관 기간이 날짜 기준이라 업로드가 시작된 뒤 날짜 변경은 막아야 한다(수정 화면은 아직 없음).
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-select/guest-albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), weddingDate, ceremonyTime: ceremonyTime || null, venue: venue.trim() || null, greeting: greeting.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "앨범을 만들지 못했어요.");
      router.push(`/customer-select/guest/${data.id}?created=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "앨범을 만들지 못했어요.");
      setSubmitting(false);
    }
  }

  const clearError = (key: string) => setFieldErrors((current) => ({ ...current, [key]: "" }));

  return (
    <>
      <PhotographerLightPageFrame className="flex-1 pb-8">
        <div className="mx-auto flex max-w-[840px] flex-col gap-5">
          <ProjectFormPageHeading
            title="하객 사진 모으기"
            description="앨범을 만들면 하객에게 보여줄 QR과 링크가 바로 생겨요."
            onBack={() => router.push("/customer-select/new")}
          />
          <ProjectFormSection number="01" title="기본 정보" description="앨범 이름은 하객 업로드 화면 맨 위에 보여요.">
            <div id="field-name">
              <ProjectFormField error={fieldErrors.name} label="앨범 이름" required>
                <ProjectFormInput
                  autoFocus
                  maxLength={60}
                  className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(name), error: Boolean(fieldErrors.name) })}`}
                  value={name}
                  onChange={(event) => { setName(event.target.value); clearError("name"); }}
                  placeholder="예: 민수 ♥ 지현 결혼식"
                />
              </ProjectFormField>
            </div>
            <div id="field-weddingDate" className="max-w-[360px]">
              <ProjectFormField error={fieldErrors.weddingDate} label="결혼식 날짜" required>
                <ProjectFormDateInput
                  className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(weddingDate), error: Boolean(fieldErrors.weddingDate) })}`}
                  value={weddingDate}
                  onChange={(event) => { setWeddingDate(event.target.value); clearError("weddingDate"); }}
                  onClick={(event) => event.currentTarget.showPicker?.()}
                />
              </ProjectFormField>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {weddingDate
                ? `사진과 영상은 결혼식 날짜부터 ${retentionDays}일 동안, ${formatWeddingDateTime(retentionEndDate(weddingDate, retentionDays))}까지 보관해요.`
                : `사진과 영상은 결혼식 날짜부터 ${retentionDays}일 동안 보관해요.`}
            </p>
          </ProjectFormSection>

          <details className="rounded-2xl border border-border-subtle bg-surface">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-accent">예식 시간·예식장·하객 인사말 <span className="font-normal text-muted-foreground">(선택)</span></summary>
            <ProjectFormSection number="02" title="하객에게 보여줄 정보" description="하객이 맞는 앨범에 들어왔는지 알 수 있게 업로드 화면에 보여요." required={false}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ProjectFormField label="예식 시작 시간">
                  {/* 30분 단위 — iOS 시간 휠은 step을 무시해 select로 고른다. */}
                  <select
                    aria-label="예식 시작 시간"
                    className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(ceremonyTime) })}`}
                    value={ceremonyTime}
                    onChange={(event) => setCeremonyTime(event.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {CEREMONY_TIMES.map((time) => <option key={time} value={time}>{formatCeremonyTime(time)}</option>)}
                  </select>
                </ProjectFormField>
                <ProjectFormField label="예식장">
                  <ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(venue) })}`} value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="예: 더채플앳청담" />
                </ProjectFormField>
              </div>
              <ProjectFormField label="하객 인사말">
                <ProjectFormTextarea
                  rows={2}
                  maxLength={GREETING_MAX}
                  className={`${PROJECT_FORM_INPUT_CLASS} resize-none ${projectFormInputStateClass({ hasValue: Boolean(greeting) })}`}
                  value={greeting}
                  onChange={(event) => setGreeting(event.target.value)}
                  placeholder={DEFAULT_GUEST_GREETING}
                />
                <span className="flex justify-between gap-3 text-[12px] text-subtle-foreground"><span>비워 두면 입력란에 보이는 기본 문구가 나가요.</span><span>{greeting.length} / {GREETING_MAX}</span></span>
              </ProjectFormField>
            </ProjectFormSection>
          </details>
        </div>
      </PhotographerLightPageFrame>
      <PhotographerFormActionBar
        maxWidth={840}
        error={error}
        leading={<p className="text-sm font-bold text-foreground">만든 뒤 QR과 링크를 하객에게 공유해 주세요.</p>}
        actions={(
          <>
            <PhotographerLightButton size="work-panel" variant="secondary" onClick={() => router.push("/customer-select")} disabled={submitting}>취소</PhotographerLightButton>
            <PhotographerLightButton size="work-panel" onClick={handleCreate} pending={submitting} pendingLabel="만드는 중…">앨범 만들기</PhotographerLightButton>
          </>
        )}
      />
    </>
  );
}
