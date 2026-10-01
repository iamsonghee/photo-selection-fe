"use client";

import { CUSTOMER_SHOOT_TYPES } from "@/lib/customer-shoot-scenes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOMER_PHOTO_LIMIT } from "./upload-limit";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormField,
  ProjectFormDateInput,
  ProjectFormInput,
  ProjectFormPageHeading,
  ProjectFormSection,
  ProjectShootTypeSelector,
  projectFormInputStateClass,
} from "@/components/photographer/ProjectFormFields";

export function NewCustomerProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shootType, setShootType] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [selectionDeadline, setSelectionDeadline] = useState("");
  const [studioName, setStudioName] = useState("");
  const [photographerName, setPhotographerName] = useState("");
  const [shootRegion, setShootRegion] = useState("");
  const [shootLocation, setShootLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleCreate() {
    if (submitting) return;
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "프로젝트명을 입력해주세요.";
    if (!shootType) errors.shootType = "촬영 종류를 선택해주세요.";
    if (Number(target) < 1) errors.target = "보정받을 사진 수를 1장 이상 입력해주세요.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      requestAnimationFrame(() => document.getElementById(`field-${Object.keys(errors)[0]}`)?.querySelector<HTMLElement>("input,button")?.focus());
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-select/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shootType,
          target: Number(target),
          shootDate: shootDate || null,
          selectionDeadline: selectionDeadline || null,
          studioName: studioName.trim() || null,
          photographerName: photographerName.trim() || null,
          shootRegion: shootRegion.trim() || null,
          shootLocation: shootLocation.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      router.push(`/customer-select/${data.id}/upload`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PhotographerLightPageFrame className="flex-1 pb-8">
        <div className="mx-auto max-w-[840px]">
          <ProjectFormPageHeading
            title="어떤 사진을 골라볼까요?"
            description="촬영 정보와 보정받을 사진 수를 입력하고 사진을 올려보세요."
            onBack={() => router.push("/customer-select")}
          />
          <div className="flex flex-col gap-5">
            <ProjectFormSection number="01" title="기본 정보" description="프로젝트를 구분하고 셀렉 기준으로 사용할 정보를 입력해 주세요.">
            <div id="field-name">
              <ProjectFormField error={fieldErrors.name} label="프로젝트명" required>
                <ProjectFormInput
                  autoFocus
                  maxLength={60}
                  className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(name), error: Boolean(fieldErrors.name) })}`}
                  value={name}
                  onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: "" })); }}
                  placeholder="예: 지우 돌잔치"
                />
              </ProjectFormField>
            </div>

            <div id="field-shootType">
              <ProjectFormField group error={fieldErrors.shootType} label="촬영 종류" required>
                <ProjectShootTypeSelector options={CUSTOMER_SHOOT_TYPES} value={shootType} onChange={(value) => { setShootType(value); setFieldErrors((current) => ({ ...current, shootType: "" })); }} />
              </ProjectFormField>
            </div>

            <div id="field-target" className="max-w-[360px]">
              <ProjectFormField error={fieldErrors.target} label="보정받을 사진 수" required hint="작가님과 약속한 장수를 입력해 주세요. 실제 선택 장수가 달라도 전달할 수 있어요.">
                <div className="relative">
                  <ProjectFormInput
                    className={`${PROJECT_FORM_INPUT_CLASS} !pr-14 text-right ${projectFormInputStateClass({ hasValue: Boolean(target), error: Boolean(fieldErrors.target) })}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={target}
                    onChange={(event) => { setTarget(event.target.value.replace(/\D/g, "")); setFieldErrors((current) => ({ ...current, target: "" })); }}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-sm text-subtle-foreground">장</span>
                </div>
              </ProjectFormField>
            </div>
            </ProjectFormSection>

            <details className="rounded-2xl border border-border-subtle bg-surface">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-accent">촬영일·업체·장소 등 추가 정보 <span className="font-normal text-muted-foreground">(선택)</span></summary>
            <ProjectFormSection number="02" title="일정 및 작가 정보" description="나중에 설정에서 수정할 수 있어요." required={false}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ProjectFormField label="촬영일">
                  <ProjectFormDateInput
                    className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootDate) })}`}
                    value={shootDate}
                    onChange={(event) => setShootDate(event.target.value)}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                  />
                </ProjectFormField>
                <ProjectFormField label="셀렉 마감일">
                  <ProjectFormDateInput
                    className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(selectionDeadline) })}`}
                    value={selectionDeadline}
                    min={shootDate || undefined}
                    onChange={(event) => setSelectionDeadline(event.target.value)}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                  />
                </ProjectFormField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProjectFormField label="스튜디오·업체명">
                <ProjectFormInput
                  maxLength={100}
                  className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(studioName) })}`}
                  value={studioName}
                  onChange={(event) => setStudioName(event.target.value)}
                  placeholder="예: 오렌지스튜디오"
                />
              </ProjectFormField>
              <ProjectFormField label="담당 작가명">
                <ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(photographerName) })}`} value={photographerName} onChange={(event) => setPhotographerName(event.target.value)} placeholder="예: 김아컷 작가" />
              </ProjectFormField>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ProjectFormField label="촬영 지역"><ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootRegion) })}`} value={shootRegion} onChange={(event) => setShootRegion(event.target.value)} placeholder="예: 서울 성동구" /></ProjectFormField>
                <ProjectFormField label="촬영 장소"><ProjectFormInput maxLength={150} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootLocation) })}`} value={shootLocation} onChange={(event) => setShootLocation(event.target.value)} placeholder="예: 서울숲" /></ProjectFormField>
              </div>
            </ProjectFormSection>
            </details>
            <div className="text-sm leading-6 text-muted-foreground">
              <p>모든 프로젝트를 합해 최대 {CUSTOMER_PHOTO_LIMIT.toLocaleString()}장까지 저장할 수 있어요.</p>
              <p>원본 파일은 직접 보관해 주세요. 사진 선택용 이미지를 저장해요.</p>
            </div>
          </div>
        </div>
      </PhotographerLightPageFrame>

      <PhotographerFormActionBar
        maxWidth={840}
        error={error}
        leading={<div><p className="text-sm font-bold text-foreground">프로젝트를 만든 후 사진을 올립니다.</p><p className="mt-1 text-xs text-muted-foreground">업로드한 순서와 원본 파일명은 그대로 유지돼요.</p></div>}
        actions={(
          <>
            <PhotographerLightButton variant="secondary" onClick={() => router.push("/customer-select")} disabled={submitting}>취소</PhotographerLightButton>
            <PhotographerLightButton onClick={handleCreate} pending={submitting} pendingLabel="생성 중…">사진 올리기</PhotographerLightButton>
          </>
        )}
      />
    </>
  );
}
