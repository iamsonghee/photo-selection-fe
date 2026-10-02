"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { formatSceneRange } from "@/lib/customer-scenes";
import { customerShootTypeLabel } from "@/lib/customer-shoot-scenes";
import type { Photo } from "@/types";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { CustomerShareLinkField } from "../_lib/CustomerShareLinkField";
import { ProjectStepHeader } from "../_lib/ProjectStepHeader";
import { customerProjectAction, customerProjectDestination, customerProjectStatus } from "../_lib/project-routing";
import { activeParticipants, likedBy, useCustomerSelectStore } from "../_lib/real-store";
import { rememberGroupSimilar, setAsideKey } from "./select/AiTidySheet";
import { useSceneAnalysis } from "./select/useSceneAnalysis";

const date = (value?: string | null) => value ? value.slice(0, 10).replaceAll("-", ".") : null;
const textLink = "text-[13px] font-semibold text-accent hover:text-[var(--accent-hover)]";

/** 장면 대표 사진: 장면 가운데 컷(첫 컷은 디테일·준비 컷인 경우가 많다). */
const middleOf = <T,>(items: readonly T[]) => items[Math.floor(items.length / 2)];

function Thumb({ photo, className = "" }: { photo?: Photo; className?: string }) {
  return (
    <span className={`relative block overflow-hidden bg-surface-raised ${className}`}>
      {photo?.url ? <Image src={photo.url} alt="" fill unoptimized sizes="(min-width: 768px) 20vw, 40vw" className="object-cover" /> : null}
    </span>
  );
}

/**
 * 프로젝트 상세(허브). 박스를 반복하지 않고 여백·구분선으로 나누며, 장면 카드의 사진을 주인공으로 둔다.
 * 진행 단계·촬영 정보·참여자는 한 줄 요약으로 줄여 주 버튼(지금 할 단계)이 먼저 보이게 한다.
 */
export function ProjectHome({ projectId, retouchDone }: { projectId: string; retouchDone: boolean }) {
  const router = useRouter();
  const store = useCustomerSelectStore();
  const { project, hydrated } = store;
  // 장면은 고르기 화면과 같은 판단(AI 장면, 정리 후 장면 근거가 없으면 시간 장면, 정리 전·중이면 없음)과 같은 번호(?scene=N)를 쓴다.
  const analysis = useSceneAnalysis(projectId, project.photos, project.shootType, project.aiScenes, store.refresh);
  const [tidyError, setTidyError] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <CustomerSelectShell>
        <main className="grid flex-1 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" /></main>
      </CustomerSelectShell>
    );
  }

  const stage = { id: projectId, photo_count: project.photoCount, retouch_done: retouchDone };
  const selected = new Set(project.selectedIds);
  const sent = project.exported || project.deliveryCount > 0;
  const people = activeParticipants(project);
  const photoById = new Map(project.photos.map((photo) => [photo.id, photo]));
  const scenes = analysis.scenes ?? [];
  // 장면이 없을 때 보여줄 사진: 촬영 시간순으로 고르게 8장(장면 정리 없이 고르는 사람도 있으니 사진 자체를 보여준다).
  const timeOrdered = [...project.photos].sort((a, b) => (a.takenAt ?? "\uffff").localeCompare(b.takenAt ?? "\uffff") || a.orderIndex - b.orderIndex);
  const previewCount = Math.min(8, timeOrdered.length);
  const preview = Array.from({ length: previewCount }, (_, index) => timeOrdered[Math.floor((index + 0.5) * timeOrdered.length / previewCount)]);
  async function startTidy() {
    // 업로드 완료 안내의 "AI로 정리하고 고르기"와 같은 기본값 — 정리를 시작하고 고르기 화면에서 진행을 본다.
    rememberGroupSimilar(projectId, true);
    try { localStorage.setItem(setAsideKey(projectId), "1"); } catch {}
    const failed = await analysis.start(["similarity", "quality"]);
    if (failed) setTidyError(failed);
    else router.push(`/customer-select/${projectId}/select`);
  }
  const settingsHref = `/customer-select/${projectId}/settings?from=home`;
  // 만들 때 입력한 값: 촬영 종류·보정 받을 사진 수·날짜·장소·스튜디오·셀렉 마감.
  const meta = [customerShootTypeLabel(project.shootType || null), `보정 ${project.target.toLocaleString()}장`, date(project.shootDate), project.shootLocation || project.shootRegion, project.studioName || project.photographerName, project.selectionDeadline ? `셀렉 마감 ${date(project.selectionDeadline)}` : null].filter(Boolean);
  const steps = [
    { label: "올리기", value: `${project.photoCount.toLocaleString()}장`, href: `/customer-select/${projectId}/upload`, done: project.photoCount > 0 },
    { label: "고르기", value: `${selected.size.toLocaleString()} / ${project.target.toLocaleString()}장`, href: `/customer-select/${projectId}/select`, done: selected.size > 0 },
    { label: "보내기", value: sent ? `보냈어요${project.deliveryCount > 1 ? ` ${project.deliveryCount}번` : ""}` : "전", href: `/customer-select/${projectId}/review`, done: sent },
  ];

  return (
    <CustomerSelectShell compactHeader compactTitle={<ProjectStepHeader projectId={projectId} name={project.name} />}>
      <main className="mx-auto flex w-full max-w-[1120px] flex-col px-5 pb-12 md:px-8">
        <section className="flex flex-col gap-4 border-b border-border-subtle pb-6 pt-6 md:flex-row md:pt-8 md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-primary">{customerProjectStatus(stage, selected.size)}</p>
            <h1 className="mt-1 truncate text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">{project.name || "이름 없는 프로젝트"}</h1>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {meta.join(" · ")}{meta.length ? " · " : ""}<Link href={settingsHref} className="font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">설정</Link>
            </p>
            <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" aria-label="진행 상황">
              {steps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2">
                  {index > 0 ? <span className="h-px w-5 bg-border-strong md:w-8" aria-hidden /> : null}
                  <Link href={step.href} className="flex items-center gap-1.5 hover:text-foreground">
                    <span className={`size-2 rounded-full ${step.done ? "bg-accent" : "border border-border-strong"}`} aria-hidden />
                    <span className="font-semibold text-foreground">{step.label}</span>
                    <span className="text-muted-foreground">{step.value}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <PhotographerLightButton className="shrink-0" onClick={() => router.push(customerProjectDestination(stage))}>{customerProjectAction(stage, selected.size)} →</PhotographerLightButton>
        </section>

        <div className="grid gap-8 pt-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-10">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-bold">
                {scenes.length ? "장면" : "사진"}
                <span className="ml-1 text-[13px] font-semibold text-muted-foreground">{scenes.length ? scenes.length : project.photoCount ? `${project.photoCount.toLocaleString()}장` : ""}</span>
              </h2>
              {project.photoCount ? <Link href={`/customer-select/${projectId}/select`} className={textLink}>전체 보기 →</Link> : null}
            </div>
            {scenes.length ? (
              // 모바일은 작은 썸네일 + 이름 한 줄 목록(목차처럼), PC는 사진이 주인공인 카드 그리드.
              <ul className="flex flex-col divide-y divide-border-subtle md:grid md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-3 md:divide-y-0">
                {scenes.map((scene, index) => {
                  const picked = scene.photoIds.filter((id) => selected.has(id)).length;
                  return (
                    <li key={index}>
                      <Link href={`/customer-select/${projectId}/select?scene=${index}`} className="group flex items-center gap-3 py-2.5 md:block md:py-0">
                        <Thumb photo={photoById.get(middleOf(scene.photoIds))} className="size-14 shrink-0 rounded-lg transition-opacity group-hover:opacity-90 md:aspect-square md:size-auto md:rounded-xl" />
                        <span className="block min-w-0 flex-1">
                          <strong className="block truncate text-[14px] font-semibold md:mt-2">{scene.name ?? formatSceneRange(scene)}</strong>
                          <span className="block text-[12px] text-muted-foreground">
                            {scene.photoIds.length.toLocaleString()}장{picked ? <> · <span className="font-semibold text-accent">✓ {picked}</span></> : null}
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-subtle-foreground md:hidden" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : project.photoCount ? (
              <>
                <Link href={`/customer-select/${projectId}/select`} className="grid grid-cols-4 gap-1.5 overflow-hidden rounded-xl md:grid-cols-8" aria-label="사진 고르러 가기">
                  {preview.map((photo) => <Thumb key={photo.id} photo={photo} className="aspect-square rounded-lg" />)}
                </Link>
                {/* AI 장면 정리는 권하기만 한다 — 정리 없이 바로 고르는 사람도 있다. 정리 전일 때만, 작은 글자로. */}
                {analysis.status === "none" ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    장면별로 나눠 보고 싶다면 <button type="button" onClick={() => void startTidy()} className="font-semibold text-accent underline underline-offset-2">AI로 장면 정리</button>
                    {tidyError ? <span className="ml-2 font-semibold text-danger" role="alert">{tidyError}</span> : null}
                  </p>
                ) : analysis.status === "analyzing" ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">AI가 장면을 나누고 있어요 · <Link href={`/customer-select/${projectId}/select`} className={textLink}>고르기 화면에서 보기</Link></p>
                ) : null}
              </>
            ) : (
              <p className="text-[14px] text-muted-foreground">아직 올린 사진이 없어요. <Link href={`/customer-select/${projectId}/upload`} className={textLink}>사진 올리기 →</Link></p>
            )}
          </section>

          <section className="min-w-0 border-t border-border-subtle pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-bold">함께 고르는 사람</h2>
              <Link href={`${settingsHref}#sharing`} className={textLink}>링크 관리</Link>
            </div>
            {/* 초대 링크: 복사·공유. 중지 상태면 설정에서 다시 켠다. */}
            <div className="mb-4">
              {project.shareEnabled && project.shareToken
                ? <CustomerShareLinkField projectId={projectId} token={project.shareToken} allowShare />
                : <p className="text-[13px] text-muted-foreground">초대 링크가 중지되어 있어요. <Link href={`${settingsHref}#sharing`} className={textLink}>다시 켜기</Link></p>}
            </div>
            {people.length > 1 ? (
              <ul className="flex flex-col gap-2.5">
                {people.map((person) => (
                  <li key={person.id} className="flex items-center gap-2.5 text-[14px]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: person.hex }} aria-hidden>{person.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{person.id === "red" ? `${person.name} (나)` : person.name}</span>
                    <span className="shrink-0 text-[13px] text-muted-foreground">♥ {likedBy(project, person.id).length}</span>
                    {person.id !== "red" && project.participantDone[person.id] ? <span className="shrink-0 text-[12px] font-bold text-primary" title="다 골랐어요">✓</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] leading-relaxed text-muted-foreground">링크를 보내면 가족이나 친구가 찜과 메모로 함께 고를 수 있어요. 보정 받을 사진은 나만 정해요.</p>
            )}
          </section>
        </div>
      </main>
    </CustomerSelectShell>
  );
}
