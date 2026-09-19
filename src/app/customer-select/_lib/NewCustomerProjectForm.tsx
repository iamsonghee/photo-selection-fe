"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormField,
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
  const [target, setTarget] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleCreate() {
    if (submitting) return;
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "프로젝트명을 입력해주세요.";
    if (Number(target) < 1) errors.target = "목표 셀렉 수를 1 이상으로 입력해주세요.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      requestAnimationFrame(() => document.getElementById(`field-${Object.keys(errors)[0]}`)?.querySelector<HTMLElement>("input")?.focus());
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-select/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shootType, target: Number(target) }),
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
            title="새 프로젝트 만들기"
            description="프로젝트 기본 정보와 목표 셀렉 수를 설정해 주세요."
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

            <ProjectFormField group label="촬영 유형">
              <ProjectShootTypeSelector value={shootType} onChange={setShootType} />
            </ProjectFormField>

            <div id="field-target" className="max-w-[360px]">
              <ProjectFormField error={fieldErrors.target} label="목표 셀렉 수" required hint="참고용 기준이에요. 목표보다 더 고르거나 덜 골라도 괜찮아요.">
                <div className="relative">
                  <ProjectFormInput
                    className={`${PROJECT_FORM_INPUT_CLASS} pr-12 text-right md:pr-12 ${projectFormInputStateClass({ hasValue: Boolean(target), error: Boolean(fieldErrors.target) })}`}
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
