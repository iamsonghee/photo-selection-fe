"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import theme from "@/styles/AcutLightTheme.module.css";
import { InviteSheet } from "../[projectId]/select/Sheets";
import { NicknamePrompt } from "./NicknamePrompt";
import { ProjectStepHeader, type ProjectStep } from "./ProjectStepHeader";
import { activeParticipants, useCustomerSelectStore } from "./real-store";
import ui from "./ui.module.css";
import s from "./ProjectShell.module.css";

export type ProjectShellOptions = {
  /** 헤더에서 강조할 단계. 없으면(설정·완료 등) 단계가 모두 링크로 보인다. */
  step?: ProjectStep;
  /** 화면 높이에 잠근 작업 화면(고르기·업로드): 문서 스크롤 대신 안쪽 스크롤을 쓴다. */
  viewportLocked?: boolean;
  /** 초대 인트로처럼 헤더 없이 화면 전체를 쓰는 상태. */
  hidden?: boolean;
  /** 헤더 오른쪽 PC 전용 보조 정보(업로드의 전체 이용량). */
  headerMeta?: ReactNode;
  /** 참여자가 보는 사진을 열 수 있는 화면(고르기)이 등록한다 — 헤더 아바타를 누르면 그 사진을 연다. */
  onOpenParticipantPhoto?: (photoId: string) => void;
};

const ShellContext = createContext<((options: ProjectShellOptions) => void) | null>(null);

/**
 * 프로젝트 화면이 공통 헤더에 바라는 것을 알린다. 매 렌더마다 알려 이용량처럼 바뀌는 보조 정보도 따라가고,
 * 화면을 떠나면 기본값으로 돌린다(다음 화면이 잠금·단계를 물려받지 않게).
 */
export function useProjectShell(options: ProjectShellOptions) {
  const set = useContext(ShellContext);
  if (!set) throw new Error("useProjectShell은 ProjectShellProvider 안에서만 쓴다.");
  useLayoutEffect(() => { set(options); });
  useLayoutEffect(() => () => set({}), [set]);
}

/**
 * 셀프 고객 프로젝트 화면의 공통 셸: 라이트 캔버스 + 56px 헤더(로고 마크 · 프로젝트명 → 목록 · 단계 · 참여자 · 초대).
 * 레이아웃에서 한 번만 그려 올리기·고르기·보내기를 오가도 헤더가 그대로 남는다 — 화면마다 헤더를 다시 만들면 깜빡인다.
 * 프로젝트명·참여자는 프로젝트 저장소에서 읽고, 화면별 차이(단계·잠금·숨김)는 `useProjectShell`로 받는다.
 */
export function ProjectShellProvider({ children }: { children: ReactNode }) {
  const projectId = useParams().projectId as string;
  const [options, setOptions] = useState<ProjectShellOptions>({});
  const set = useCallback((next: ProjectShellOptions) => setOptions(next), []);
  const { project, hydrated, isOwner, currentIdentity: me, accessDenied } = useCustomerSelectStore();
  const [inviteOpen, setInviteOpen] = useState(false);
  const people = useMemo(() => activeParticipants(project), [project]);
  const online = useMemo(() => new Set<string>(project.onlineParticipants ?? []), [project.onlineParticipants]);
  const photoIds = useMemo(() => new Set(project.photos.map((photo) => photo.id)), [project.photos]);
  const locked = Boolean(options.viewportLocked);
  const myDone = Boolean(project.participantDone[me]);
  const openPhoto = options.onOpenParticipantPhoto;

  return (
    <ShellContext.Provider value={set}>
      {/* 잠금 화면은 h-dvh 대신 fixed inset-0: iOS 26 Safari 등은 dvh를 하단 툴바 위까지로 잡아 맨 아래 바가 떠 보인다. */}
      <div data-acut-light-canvas data-customer-select data-viewport-locked={locked || undefined} className={`${theme.lightTheme} flex flex-col bg-background text-foreground ${locked ? "fixed inset-0 overflow-hidden" : "min-h-dvh"}`}>
        {!options.hidden && (
          <header className={`shrink-0 border-b border-border-subtle bg-surface ${locked ? "" : "sticky top-0 z-40"}`}>
            <div className="flex h-14 w-full items-center gap-3 px-5 md:px-8">
              {/* 프로젝트 화면은 "A" 마크만 — 프로젝트명이 헤더의 주인공. */}
              <BrandLogoBar href="/customer-select" size="md" markOnly />
              <div data-compact-project-title className="min-w-0 md:border-l md:border-border-subtle md:pl-3">
                {hydrated
                  ? <ProjectStepHeader projectId={projectId} name={project.name} step={options.step} isOwner={isOwner} />
                  : <span aria-hidden className="block h-4 w-32 rounded-full bg-surface-raised" />}
              </div>
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {options.headerMeta ? <div className="hidden md:block">{options.headerMeta}</div> : null}
                {hydrated && !accessDenied && (
                  // 참여자: 색 아바타(이름 첫 글자)만 겹쳐 놓는다. 온라인은 초록 점, 다 골랐으면 ✓, 이름·상태는 마우스를 올리면 보인다.
                  // 보는 사진이 있는 참여자는 눌러서 같은 사진을 연다(고르기 화면이 등록했을 때). 혼자일 때는 아바타 없이 초대 버튼만.
                  <div className={s.people}>
                    {people.length > 1 && (
                      <span className={ui.avatars} role="group" aria-label="함께 고르는 사람">
                        {people.map((person) => {
                          const isOnline = online.has(person.id);
                          if (person.id === me) return <NicknamePrompt key={person.id} hex={person.hex} isDone={myDone} online={isOnline} />;
                          const done = project.participantDone[person.id];
                          const viewingId = project.participantViews?.[person.id];
                          const viewing = openPhoto && viewingId && isOnline && photoIds.has(viewingId) ? viewingId : null;
                          const label = [person.name, done ? "다 골랐어요" : null, viewing ? "보는 사진 열기" : isOnline ? "온라인" : null].filter(Boolean).join(" · ");
                          const className = `${ui.avatar} ${isOnline ? ui.avatarOnline : ""} ${viewing ? ui.avatarViewing : ""}`;
                          const content = <>{person.name.slice(0, 1)}{done ? <span className={ui.avatarDone} aria-hidden>✓</span> : null}</>;
                          return viewing
                            ? <button key={person.id} type="button" className={className} style={{ background: person.hex }} title={label} aria-label={label} onClick={() => openPhoto?.(viewing)}>{content}</button>
                            : <span key={person.id} role="img" className={className} style={{ background: person.hex }} title={label} aria-label={label}>{content}</span>;
                        })}
                      </span>
                    )}
                    {isOwner && <button type="button" className={s.inviteButton} aria-label="초대" onClick={() => setInviteOpen(true)}><Plus size={14} /><span className={s.inviteLabel}>초대</span></button>}
                  </div>
                )}
              </div>
            </div>
          </header>
        )}
        {children}
        {inviteOpen && <InviteSheet projectId={projectId} shareToken={project.shareToken} shareEnabled={project.shareEnabled} people={people} online={online} done={project.participantDone} onClose={() => setInviteOpen(false)} />}
      </div>
    </ShellContext.Provider>
  );
}
