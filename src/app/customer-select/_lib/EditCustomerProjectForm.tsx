"use client";

import { CUSTOMER_SHOOT_TYPES } from "@/lib/customer-shoot-scenes";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PhotographerLightPageFrame } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerFormActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import {
  PROJECT_FORM_INPUT_CLASS,
  ProjectFormDateInput,
  ProjectFormField,
  ProjectFormInput,
  ProjectFormPageHeading,
  ProjectFormSection,
  ProjectShootTypeSelector,
  projectFormInputStateClass,
} from "@/components/photographer/ProjectFormFields";
import { CustomerShareLinkManager } from "./CustomerShareLinkManager";

type EditableProject = {
  id: string;
  name: string;
  shoot_type: string | null;
  target_count: number;
  shoot_date: string | null;
  selection_deadline: string | null;
  studio_name: string | null;
  photographer_name: string | null;
  shoot_region: string | null;
  shoot_location: string | null;
  photo_count: number;
  share_token: string;
  sharing_enabled: boolean;
};

export function EditCustomerProjectForm({ project }: { project: EditableProject }) {
  const router = useRouter();
  // 프로젝트 화면(상세의 "설정에서 수정", 업로드의 "촬영 종류 바꾸기")에서 왔으면 저장·취소 뒤 그 화면으로 돌아간다.
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const deleteFromMenu = searchParams.get("delete") === "1";
  const backHref = from === "home" ? `/customer-select/${project.id}`
    : from && ["upload", "select", "review"].includes(from) ? `/customer-select/${project.id}/${from}` : "/customer-select";
  const [name, setName] = useState(project.name);
  const [shootType, setShootType] = useState<string | null>(project.shoot_type);
  const [target, setTarget] = useState(String(project.target_count));
  const [shootDate, setShootDate] = useState(project.shoot_date ?? "");
  const [selectionDeadline, setSelectionDeadline] = useState(project.selection_deadline ?? "");
  const [studioName, setStudioName] = useState(project.studio_name ?? "");
  const [photographerName, setPhotographerName] = useState(project.photographer_name ?? "");
  const [shootRegion, setShootRegion] = useState(project.shoot_region ?? "");
  const [shootLocation, setShootLocation] = useState(project.shoot_location ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(deleteFromMenu);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save() {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "프로젝트명을 입력해주세요.";
    if (!shootType) errors.shootType = "촬영 종류를 선택해주세요.";
    if (Number(target) < 1) errors.target = "최종 선택 장수를 1장 이상 입력해주세요.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customer-select/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shootType, target: Number(target), shootDate: shootDate || null, selectionDeadline: selectionDeadline || null, studioName: studioName.trim() || null, photographerName: photographerName.trim() || null, shootRegion: shootRegion.trim() || null, shootLocation: shootLocation.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "수정 실패");
      router.push(backHref);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "수정 실패");
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/customer-select/projects/${project.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "삭제 실패");
      router.push("/customer-select");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "삭제 실패");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return <>
    <PhotographerLightPageFrame className="flex-1 pb-8">
      <div className="mx-auto max-w-[840px]">
        <ProjectFormPageHeading title="프로젝트 설정" description="촬영 정보와 최종 선택 장수를 수정할 수 있어요." onBack={() => router.push(backHref)} />
        <div className="flex flex-col gap-5">
          <ProjectFormSection number="01" title="기본 정보" description="프로젝트명과 셀렉 기준을 관리합니다.">
            <div id="field-name"><ProjectFormField error={fieldErrors.name} label="프로젝트명" required><ProjectFormInput autoFocus={!confirmDelete} maxLength={60} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(name), error: Boolean(fieldErrors.name) })}`} value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: "" })); }} /></ProjectFormField></div>
            <div id="field-shootType"><ProjectFormField group error={fieldErrors.shootType} label="촬영 종류" required><ProjectShootTypeSelector options={CUSTOMER_SHOOT_TYPES} value={shootType} onChange={(value) => { setShootType(value); setFieldErrors((current) => ({ ...current, shootType: "" })); }} /></ProjectFormField></div>
            <div id="field-target" className="max-w-[360px]"><ProjectFormField error={fieldErrors.target} label="최종 선택 장수" required hint="작가님과 약속한 장수를 입력해 주세요. 실제 선택 장수가 달라도 전달할 수 있어요."><div className="relative"><ProjectFormInput className={`${PROJECT_FORM_INPUT_CLASS} !pr-14 text-right ${projectFormInputStateClass({ hasValue: Boolean(target), error: Boolean(fieldErrors.target) })}`} inputMode="numeric" pattern="[0-9]*" value={target} onChange={(event) => { setTarget(event.target.value.replace(/\D/g, "")); setFieldErrors((current) => ({ ...current, target: "" })); }} /><span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-sm text-subtle-foreground">장</span></div></ProjectFormField></div>
          </ProjectFormSection>

          <ProjectFormSection number="02" title="일정 및 작가 정보" description="프로젝트를 찾고 전달할 때 사용하는 정보입니다." required={false}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProjectFormField label="촬영일"><ProjectFormDateInput className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootDate) })}`} value={shootDate} onChange={(event) => setShootDate(event.target.value)} onClick={(event) => event.currentTarget.showPicker?.()} /></ProjectFormField>
              <ProjectFormField label="셀렉 마감일"><ProjectFormDateInput className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(selectionDeadline) })}`} value={selectionDeadline} min={shootDate || undefined} onChange={(event) => setSelectionDeadline(event.target.value)} onClick={(event) => event.currentTarget.showPicker?.()} /></ProjectFormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProjectFormField label="스튜디오·업체명"><ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(studioName) })}`} value={studioName} onChange={(event) => setStudioName(event.target.value)} /></ProjectFormField>
              <ProjectFormField label="담당 작가명"><ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(photographerName) })}`} value={photographerName} onChange={(event) => setPhotographerName(event.target.value)} /></ProjectFormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProjectFormField label="촬영 지역"><ProjectFormInput maxLength={100} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootRegion) })}`} value={shootRegion} onChange={(event) => setShootRegion(event.target.value)} /></ProjectFormField>
              <ProjectFormField label="촬영 장소"><ProjectFormInput maxLength={150} className={`${PROJECT_FORM_INPUT_CLASS} ${projectFormInputStateClass({ hasValue: Boolean(shootLocation) })}`} value={shootLocation} onChange={(event) => setShootLocation(event.target.value)} /></ProjectFormField>
            </div>
          </ProjectFormSection>

          <CustomerShareLinkManager projectId={project.id} initialToken={project.share_token} initialEnabled={project.sharing_enabled} />

          <details className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-danger/35 sm:px-6 [&::-webkit-details-marker]:hidden">
              프로젝트 삭제
              <ChevronDown size={17} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-danger/20 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <p className="text-[13px] leading-5 text-muted-foreground">업로드한 사진 {project.photo_count.toLocaleString()}장과 셀렉·보정 기록이 모두 삭제되며 복구할 수 없습니다.</p>
              <PhotographerLightButton variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>프로젝트 삭제</PhotographerLightButton>
            </div>
          </details>
        </div>
      </div>
    </PhotographerLightPageFrame>

    <PhotographerFormActionBar maxWidth={840} error={error} leading={<p className="text-sm text-muted-foreground">변경한 정보는 프로젝트 목록과 셀렉 화면에 반영됩니다.</p>} actions={<><PhotographerLightButton size="work-panel" variant="secondary" onClick={() => router.push(backHref)} disabled={saving}>취소</PhotographerLightButton><PhotographerLightButton size="work-panel" onClick={save} pending={saving} pendingLabel="저장 중…">변경사항 저장</PhotographerLightButton></>} />
    {confirmDelete && <SelectionConfirmDialog title="프로젝트를 삭제할까요?" description={<>업로드한 사진과 모든 작업 기록이 삭제됩니다.<br />이 작업은 되돌릴 수 없어요.</>} confirmLabel="삭제하기" busyLabel="삭제 중…" confirming={deleting} error={error} danger onCancel={() => { setConfirmDelete(false); if (deleteFromMenu) router.push("/customer-select"); }} onConfirm={remove} />}
  </>;
}
