"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, ChevronRight, ImagePlus, Link2, MoreVertical, Plus, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { formatSceneRange } from "@/lib/customer-scenes";
import { customerShootTypeLabel, isCustomerShootType } from "@/lib/customer-shoot-scenes";
import type { Photo } from "@/types";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { ProjectStepHeader, type ProjectStep } from "../_lib/ProjectStepHeader";
import { customerProjectAction, customerProjectDestination, customerProjectStatus, kstToday, selectionDeadlineBadge } from "../_lib/project-routing";
import { activeParticipants, useCustomerSelectStore } from "../_lib/real-store";
import { rememberGroupSimilar, setAsideKey } from "./select/AiTidySheet";
import { useSceneAnalysis } from "./select/useSceneAnalysis";
import { InviteSheet } from "./select/Sheets";

const date = (value?: string | null) => value ? value.slice(0, 10).replaceAll("-", ".") : null;
// 모바일 장면 목록은 처음 이만큼만 보이고 나머지는 "전체 장면 보기"로 펼친다.
const MOBILE_SCENE_PREVIEW = 5;
// PC 장면 카드는 처음 2줄(5열 기준)만 — 사진을 너무 많이 늘어놓지 않는다.
const PC_SCENE_PREVIEW = 10;
const textLink = "text-[13px] font-semibold text-accent hover:text-[var(--accent-hover)]";

/** 장면 대표 사진: 장면 가운데 컷(첫 컷은 디테일·준비 컷인 경우가 많다). */
const middleOf = <T,>(items: readonly T[]) => items[Math.floor(items.length / 2)];

function Thumb({ photo, className = "", large = false }: { photo?: Photo; className?: string; /** 큰 대표 사진은 프리뷰 해상도로. */ large?: boolean }) {
  const src = large ? photo?.previewUrl ?? photo?.url : photo?.url;
  return (
    <span className={`relative block overflow-hidden bg-surface-raised ${className}`}>
      {src ? <Image src={src} alt="" fill unoptimized sizes="(min-width: 768px) 20vw, 40vw" className="object-cover" /> : null}
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
  const [allScenes, setAllScenes] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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
  async function startTidy() {
    // 업로드 완료 안내의 "AI로 정리하고 고르기"와 같은 기본값 — 정리를 시작하고 고르기 화면에서 진행을 본다.
    rememberGroupSimilar(projectId, true);
    try { localStorage.setItem(setAsideKey(projectId), "1"); } catch {}
    const failed = await analysis.start(["scene", "similarity", "quality"]);
    if (failed) setTidyError(failed);
    else router.push(`/customer-select/${projectId}/select`);
  }
  const settingsHref = `/customer-select/${projectId}/settings?from=home`;
  // 헤더 단계: 끝난 단계는 ✓, 지금 할 단계는 강조.
  const doneSteps = ([project.photoCount > 0 && "upload", sent && "select", sent && "send"] as const).filter(Boolean) as ProjectStep[];
  const nextStep: ProjectStep | undefined = retouchDone || sent ? undefined : project.photoCount ? "select" : "upload";
  const today = kstToday();
  const deadline = selectionDeadlineBadge(project.selectionDeadline, today, retouchDone);
  // 만들 때 입력한 값만(빈 값·"미입력"은 숨긴다) 프로젝트명 아래 한 줄로. 최종 선택 장수·마감은 진행 바·칩에 있다.
  const info = [isCustomerShootType(project.shootType) ? customerShootTypeLabel(project.shootType) : null, date(project.shootDate), project.shootLocation || project.shootRegion, project.studioName || project.photographerName].filter(Boolean) as string[];
  // 대표 사진: 목록 카드 표지와 같은 첫 사진.
  const cover = [...project.photos].sort((a, b) => a.orderIndex - b.orderIndex)[0];
  const doneCount = people.filter((person) => project.participantDone[person.id]).length;
  const selectedPercent = project.target > 0 ? Math.min(100, selected.size / project.target * 100) : 0;
  const action = <PhotographerLightButton size="confirmation" className="w-full md:w-auto" onClick={() => router.push(customerProjectDestination(stage))}>{customerProjectAction(stage, selected.size)}<ArrowRight size={18} strokeWidth={2.4} /></PhotographerLightButton>;

  return (
    <CustomerSelectShell compactHeader compactTitle={<ProjectStepHeader projectId={projectId} name={project.name} done={doneSteps} next={nextStep} />}>
      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-5 pb-32 pt-5 md:flex-1 md:justify-center md:gap-6 md:px-8 md:py-10">
        {/* 프로젝트 카드: 대표 사진·이름·상태, 고른 진행, 함께 고르는 사람, 주 버튼. 사진은 고르기 화면에서 본다. */}
        <section aria-label="진행 상황" className="relative rounded-[24px] border border-border-subtle bg-surface p-5 md:p-6">
          <div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <Link href={project.photoCount ? `/customer-select/${projectId}/select` : `/customer-select/${projectId}/upload`} aria-label={project.photoCount ? "사진 고르러 가기" : "사진 올리기"} className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-raised text-subtle-foreground md:size-24">
                  {cover ? <Thumb photo={cover} large className="size-full" /> : <ImagePlus size={24} />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 text-[12px] font-bold"><span className={`size-1.5 rounded-full ${retouchDone ? "bg-foreground" : selected.size ? "bg-primary" : "bg-subtle-foreground"}`} aria-hidden />{customerProjectStatus(stage, selected.size)}</span>
                    {deadline ? <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold ${deadline.urgent ? "bg-accent text-white" : "bg-surface-raised"}`}>{deadline.label}<span className="ml-1 font-semibold opacity-75">{date(project.selectionDeadline)?.slice(5)}</span></span> : null}
                    {sent ? <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-[12px] font-bold text-primary">보냈어요{project.deliveryCount > 1 ? ` · ${project.deliveryCount}번` : ""}</span> : null}
                  </div>
                  <h2 className="mt-1.5 line-clamp-2 break-keep text-[20px] font-extrabold tracking-[-0.03em] md:text-[24px]">{project.name || "이름 없는 프로젝트"}</h2>
                  <p className="mt-1 break-keep text-[13px] leading-5 text-muted-foreground">{[...info, `사진 ${project.photoCount.toLocaleString()}장`, scenes.length ? `장면 ${scenes.length}개` : null].filter(Boolean).join(" · ")}</p>
                </div>
                {/* PC: 주 버튼은 프로젝트명 줄 오른쪽 — 진행 바·참여자 줄은 카드 폭을 다 쓴다. */}
                <div className="shrink-0 max-md:hidden">{action}</div>
                {/* 프로젝트 관리(설정·링크)는 목록 카드처럼 ⋮ 메뉴에 모은다. */}
                <details className="group/menu relative z-20 -mr-2 shrink-0">
                  <summary aria-label="프로젝트 더보기" className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground [&::-webkit-details-marker]:hidden"><MoreVertical size={18} /></summary>
                  <div className="absolute right-0 top-10 w-44 rounded-2xl border border-border-subtle bg-surface p-1.5 shadow-[0_16px_40px_rgba(2,56,82,0.14)]">
                    <Link href={settingsHref} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-raised"><Settings size={15} />프로젝트 설정</Link>
                    <Link href={`${settingsHref}#sharing`} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-raised"><Link2 size={15} />링크 관리</Link>
                  </div>
                </details>
              </div>
              {project.photoCount ? <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-muted-foreground">최종 선택</span>
                  <span className="text-[14px] font-semibold text-muted-foreground"><strong className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{selected.size.toLocaleString()}</strong> / {project.target.toLocaleString()}장</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="최종 선택 진행" aria-valuemin={0} aria-valuemax={project.target} aria-valuenow={selected.size}>
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${selectedPercent}%` }} />
                </div>
              </div> : null}
              <div className="mt-4 flex items-center gap-3 border-t border-border-subtle pt-4">
                <span className="flex -space-x-2" aria-hidden>
                  {people.slice(0, 4).map((person) => <span key={person.id} className="grid size-8 place-items-center rounded-full border-2 border-surface text-[11px] font-bold text-white" style={{ background: person.hex }}>{person.name.slice(0, 1)}</span>)}
                  {people.length > 4 ? <span className="grid size-8 place-items-center rounded-full border-2 border-surface bg-surface-raised text-[11px] font-bold text-muted-foreground">+{people.length - 4}</span> : null}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <strong className="font-bold">함께 고르기 {people.length}명</strong>
                  <span className="block truncate text-muted-foreground">{people.length > 1 ? doneCount ? `${doneCount}명 다 골랐어요` : "고르는 중이에요" : "가족·친구를 초대해 함께 골라보세요"}</span>
                </span>
                <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-border px-3.5 text-[13px] font-bold transition-colors hover:border-border-strong hover:bg-surface-raised"><Plus size={14} strokeWidth={2.4} />초대</button>
              </div>
            </div>
          </div>
        </section>

        {/* AI 장면 정리는 권하기만 한다 — 정리 없이 바로 고르는 사람도 있다. */}
        {project.photoCount && analysis.status === "none" ? (
          <section className="flex flex-col gap-3 rounded-[24px] bg-primary/8 p-5 sm:flex-row sm:items-center md:px-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary"><Sparkles size={19} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold">AI로 장면 정리</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">장면별로 나누고 비슷한 사진을 묶어 고르기 쉽게 만들어 드려요.</p>
              {tidyError ? <p className="mt-1 text-[13px] font-semibold text-danger" role="alert">{tidyError}</p> : null}
            </div>
            <PhotographerLightButton variant="outline" className="shrink-0" onClick={() => void startTidy()}>정리 시작</PhotographerLightButton>
          </section>
        ) : project.photoCount && analysis.status === "analyzing" ? (
          <section className="flex items-center gap-3 rounded-[24px] bg-primary/8 p-5 md:px-6" role="status">
            <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-hidden />
            <p className="min-w-0 flex-1 text-[14px] font-semibold">AI가 장면을 나누고 있어요</p>
            <Link href={`/customer-select/${projectId}/select`} className={textLink}>고르기 화면에서 보기 →</Link>
          </section>
        ) : null}

        {scenes.length ? (
          <section className="min-w-0 pt-2">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold">장면<span className="ml-1.5 text-[14px] font-semibold text-muted-foreground">{scenes.length}</span></h2>
              <Link href={`/customer-select/${projectId}/select`} className={textLink}>전체 보기 →</Link>
            </div>
            {/* 모바일은 작은 썸네일 목차(한 줄씩), PC는 사진이 보이는 장면 카드 5열. 처음엔 모바일 5개·PC 2줄(10개)만. */}
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-4 md:gap-x-4 md:gap-y-5 lg:grid-cols-5">
              {scenes.map((scene, index) => {
                const picked = scene.photoIds.filter((id) => selected.has(id)).length;
                const untimed = !scene.start && !scene.name;
                const hidden = allScenes ? undefined : index >= PC_SCENE_PREVIEW ? "hidden" : index >= MOBILE_SCENE_PREVIEW ? "max-md:hidden" : undefined;
                return (
                  <li key={index} className={hidden}>
                    <Link href={`/customer-select/${projectId}/select?scene=${index}`} className="group flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-2.5 pr-4 transition-colors hover:border-border-strong md:block md:border-0 md:bg-transparent md:p-0">
                      <span className="relative block shrink-0">
                        <Thumb photo={photoById.get(middleOf(scene.photoIds))} large className="size-12 rounded-xl md:aspect-[4/5] md:size-auto md:rounded-[18px] [&_img]:transition-transform [&_img]:duration-500 md:group-hover:[&_img]:scale-[1.04] motion-reduce:[&_img]:transition-none" />
                        {picked ? <span className="absolute right-2 top-2 hidden h-6 items-center rounded-full bg-accent px-2 text-[12px] font-bold text-white shadow-sm md:inline-flex">✓ {picked}</span> : null}
                      </span>
                      <span className="block min-w-0 flex-1">
                        {/* 촬영 시각이 없는 사진 묶음은 장면이 아니라 "기타"로 구분한다(항상 맨 뒤). */}
                        <strong className={`block truncate text-[14px] font-semibold md:mt-2.5 ${untimed ? "text-muted-foreground" : ""}`}>{untimed ? "기타 사진" : scene.name ?? formatSceneRange(scene)}</strong>
                        <span className="block text-[12px] text-muted-foreground">{untimed ? "촬영 시각 없음 · " : ""}{scene.photoIds.length.toLocaleString()}장</span>
                      </span>
                      {picked ? <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent/10 px-2 text-[12px] font-bold text-accent md:hidden">✓ {picked}</span> : null}
                      <ChevronRight size={16} className="shrink-0 text-subtle-foreground md:hidden" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {scenes.length > MOBILE_SCENE_PREVIEW && !allScenes ? <button type="button" onClick={() => setAllScenes(true)} className={`mt-3 h-11 w-full rounded-full border border-border-subtle bg-surface hover:border-border-strong ${scenes.length > PC_SCENE_PREVIEW ? "" : "md:hidden"} ${textLink}`}>전체 장면 {scenes.length}개 보기</button> : null}
          </section>
        ) : null}

      </main>
      {/* 모바일: 주 버튼을 엄지 닿는 하단에 고정. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden">{action}</div>
      {inviteOpen && <InviteSheet projectId={projectId} shareToken={project.shareToken} shareEnabled={project.shareEnabled} people={people} online={new Set(project.onlineParticipants ?? [])} done={project.participantDone} onClose={() => setInviteOpen(false)} />}
    </CustomerSelectShell>
  );
}
