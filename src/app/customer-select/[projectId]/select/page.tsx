"use client";

/**
 * 셀프 고객 셀렉 ② 고르기.
 * 촬영 시각으로 나눈 "장면"이 화면의 뼈대다 — 2,000장을 장면 몇 개의 작은 일로 쪼갠다.
 * 역할마다 메인 동작은 하나다: 소유자는 ✓ 보정 받기, 참여자는 ♡ 찜.
 * 격자는 고르는 곳, 상세는 고민하는 곳. 유사컷 묶음 표지는 바로 고르지 않고 펼쳐서 비교한다.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, CheckCircle2, ChevronDown, Grid2x2, Layers, Plus, Sparkles } from "lucide-react";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { formatSceneRange, sceneTargets } from "@/lib/customer-scenes";
import type { ColorTag, Photo } from "@/types";
import { activeParticipants, useCustomerSelectStore } from "../../_lib/real-store";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { ProjectStepHeader } from "../../_lib/ProjectStepHeader";
import { NicknamePrompt } from "../../_lib/NicknamePrompt";
import { ParticipantAccessEndedScreen, ParticipantJoinScreen } from "../../_lib/ParticipantJoinScreen";
import { EphemeralChat } from "../../_lib/EphemeralChat";
import ui from "../../_lib/ui.module.css";
import { TimelineGrid, type MobileColumns, type TimelineSection } from "./TimelineGrid";
import { PhotoDetail } from "./PhotoDetail";
import { InviteSheet, Sheet } from "./Sheets";
import { useSceneAnalysis, type NamedScene } from "./useSceneAnalysis";
import { AiTidySheet, groupSimilarKey, type AiTidyKind } from "./AiTidySheet";
import s from "./select.module.css";

type Scope = "all" | "picked" | "mine" | "popular" | "quality";

export default function CustomerSelectPage() {
  return <Suspense fallback={<SystemLoadingScreen title="사진을 불러오고 있어요" homeHref="/customer-select" />}><SelectScreen /></Suspense>;
}

function SelectScreen() {
  const projectId = useParams().projectId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useCustomerSelectStore();
  const { project, hydrated, isOwner, currentIdentity: me, participantReady, accessDenied, syncStatus, saveError, clearSaveError } = store;

  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [scope, setScope] = useState<Scope>("all");
  const [grouped, setGrouped] = useState(() => {
    try { return localStorage.getItem(groupSimilarKey(projectId)) !== "0"; } catch { return true; }
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"invite" | "scenes" | "ai" | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const photos = project.photos;
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const analysis = useSceneAnalysis(projectId, photos, project.shootType);
  const scenes = analysis.scenes;
  // 촬영 시간순 전체 목록 — 장면이 없을 때와 AI 정리 중(1차 훑어보기)에 쓴다.
  const timeOrdered = useMemo(() => [...photos].sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.orderIndex - b.orderIndex), [photos]);
  // 정리 중에 들어온 사람은 끝나도 보던 전체 보기를 유지하고, 장면별 보기는 제안만 한다.
  const [holdAll, setHoldAll] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  if (analysis.status === "analyzing" && !holdAll) setHoldAll(true);
  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const likesOf = useCallback((photoId: string) => project.photoStates[photoId]?.color ?? [], [project.photoStates]);
  const myLikes = useMemo(() => new Set(photos.filter((photo) => likesOf(photo.id).includes(me)).map((photo) => photo.id)), [likesOf, me, photos]);
  // 역할별 "고른 사진": 소유자는 최종 선택, 참여자는 내 찜.
  const picked = isOwner ? selectedIds : myLikes;
  const people = useMemo(() => activeParticipants(project), [project]);
  const online = useMemo(() => new Set<string>(project.onlineParticipants ?? []), [project.onlineParticipants]);
  const targets = useMemo(() => scenes ? sceneTargets(scenes.map((scene) => scene.photoIds.length), project.target) : [], [project.target, scenes]);

  const sceneParam = searchParams.get("scene") ?? (searchParams.get("view") === "all" ? "0" : null);
  // 장면이 있으면 모든 장면을 하나로 이어 붙인 타임라인, 정리 전·정리 중이면 촬영 시간순 한 목록.
  const sectioned = Boolean(scenes) && !holdAll;
  const showOverview = sectioned && sceneParam === null;
  const inTimeline = sectioned && sceneParam !== null;
  const initialSection = inTimeline && Number(sceneParam) >= 0 && Number(sceneParam) < scenes!.length ? Number(sceneParam) : null;
  const [currentSection, setCurrentSection] = useState(initialSection ?? 0);
  const [jump, setJump] = useState<{ section: number; nonce: number } | null>(null);
  const [focus, setFocus] = useState<{ photoId: string; nonce: number } | null>(null);
  const sectionOf = useMemo(() => new Map((scenes ?? []).flatMap((scene, index) => scene.photoIds.map((id) => [id, index] as const))), [scenes]);

  const scenePhotos = useMemo(
    () => sectioned ? scenes!.flatMap((scene) => scene.photoIds.flatMap((id) => photoById.get(id) ?? [])) : timeOrdered,
    [photoById, scenes, sectioned, timeOrdered],
  );
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return scenePhotos.filter((photo) => {
      if (scope === "picked" && !selectedIds.has(photo.id)) return false;
      if (scope === "mine" && !myLikes.has(photo.id)) return false;
      if (scope === "popular" && likesOf(photo.id).length < 2) return false;
      if (scope === "quality" && !(photo.isBlurry || (photo.faceDetected && photo.eyesClosed))) return false;
      return !text || getPhotoDisplayName(photo).toLowerCase().includes(text);
    });
  }, [likesOf, myLikes, query, scenePhotos, scope, selectedIds]);

  const groupsInView = useMemo(() => {
    const groups = new Map<string, Photo[]>();
    filtered.forEach((photo) => {
      if (photo.similarityGroupId) groups.set(photo.similarityGroupId, [...(groups.get(photo.similarityGroupId) ?? []), photo]);
    });
    return groups;
  }, [filtered]);
  const hasGroups = Array.from(groupsInView.values()).some((members) => members.length > 1);
  // 접힌 묶음의 표지는 고른 사진이 있으면 그 사진, 없으면 첫 사진.
  const visible = useMemo(() => {
    if (!grouped || !hasGroups) return filtered;
    const covers = new Map<string, string>();
    groupsInView.forEach((members, groupId) => covers.set(groupId, (members.find((member) => picked.has(member.id)) ?? members[0]).id));
    return filtered.filter((photo) => {
      const groupId = photo.similarityGroupId;
      if (!groupId || expanded.has(groupId) || (groupsInView.get(groupId)?.length ?? 0) < 2) return true;
      return covers.get(groupId) === photo.id;
    });
  }, [expanded, filtered, grouped, groupsInView, hasGroups, picked]);

  const similarOf = useCallback((photo: Photo) => photo.similarityGroupId ? photos.filter((member) => member.similarityGroupId === photo.similarityGroupId) : [], [photos]);
  const pickedInScene = useCallback((target: NamedScene) => target.photoIds.filter((id) => picked.has(id)).length, [picked]);
  const likedInScene = useCallback((target: NamedScene) => target.photoIds.filter((id) => likesOf(id).length > 0).length, [likesOf]);

  async function startTidy(kinds: AiTidyKind[]) {
    setAiPending(true);
    setAiError(null);
    const error = await analysis.start(kinds);
    setAiPending(false);
    if (error) setAiError(error);
    else setSheet(null);
  }

  /** 장면 번호면 타임라인의 그 위치로(이미 타임라인이면 스크롤만), null이면 장면 개요로. */
  function goScene(index: number | null, mode: "push" | "replace" = "push") {
    if (index !== null && inTimeline) {
      setJump({ section: index, nonce: Date.now() });
      return;
    }
    setScope("all");
    setQuery("");
    setExpanded(new Set());
    setHoldAll(false);
    const base = `/customer-select/${projectId}/select`;
    const url = index === null ? base : `${base}?scene=${index}`;
    if (mode === "push") router.push(url, { scroll: false }); else router.replace(url, { scroll: false });
  }

  // 상세에서 보고 있는 사진을 함께 고르는 사람에게 알린다.
  const { setViewingPhoto } = store;
  useEffect(() => {
    if (!participantReady) return;
    const timer = window.setTimeout(() => setViewingPhoto(openPhotoId), 250);
    return () => window.clearTimeout(timer);
  }, [openPhotoId, participantReady, setViewingPhoto]);
  useEffect(() => () => setViewingPhoto(null), [setViewingPhoto]);

  if (!hydrated) return <SystemLoadingScreen title="사진을 불러오고 있어요" homeHref="/customer-select" />;
  if (accessDenied) return <ParticipantAccessEndedScreen />;
  if (!isOwner && !participantReady) return <ParticipantJoinScreen />;

  const target = project.target;
  const pickedTotal = picked.size;
  const resumeScene = scenes ? Math.max(0, scenes.findIndex((item, index) => pickedInScene(item) < (isOwner ? targets[index] : 1))) : 0;
  const hasQuality = scenePhotos.some((photo) => photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
  const myDone = Boolean(project.participantDone[me]);
  const toReview = () => router.push(`/customer-select/${projectId}/review`);

  // AI 장면은 이름이 제목, 시간대는 보조 정보. 이름이 없으면(시간 장면) 시간대가 제목이다.
  const sceneTitle = (item: NamedScene) => item.name ?? (scenes && scenes.length > 1 ? formatSceneRange(item) : "전체 사진");
  const sceneSub = (item: NamedScene) => [item.name && item.start ? formatSceneRange(item) : null, `${item.photoIds.length}장`].filter(Boolean).join(" · ");
  const progressText = (item: NamedScene, index: number) => {
    const count = pickedInScene(item);
    const liked = likedInScene(item);
    if (!isOwner) return count ? `♡ 내 찜 ${count}장` : "아직 찜 안 했어요";
    const likedText = liked ? `♡ ${liked} · ` : "";
    if (!count) return `${likedText}아직 안 골랐어요`;
    return `${likedText}${targets[index] ? `✓ ${count} / ${targets[index]}장 정도` : `✓ ${count}장`}`;
  };
  const sceneDone = (item: NamedScene, index: number) => isOwner && targets[index] > 0 && pickedInScene(item) >= targets[index];
  const analysisBanner = analysis.status === "analyzing" ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>AI가 장면을 나누고 있어요{analysis.progress ? ` · ${analysis.progress.done.toLocaleString()} / ${analysis.progress.total.toLocaleString()}장` : ""}</strong>
        <span>그동안 마음에 드는 사진에 ♡를 눌러 두세요. 정리가 끝나면 장면별로 모아서 보여드릴게요.</span>
        {analysis.progress && <i style={{ width: `${Math.round((analysis.progress.done / Math.max(1, analysis.progress.total)) * 100)}%` }} />}
      </div>
    </div>
  ) : analysis.status === "ready" && holdAll && !promptDismissed && scenes ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>장면 정리가 끝났어요 · {scenes.length}개 장면</strong>
        <span>{myLikes.size ? `찜한 ${myLikes.size}장도 장면별로 나눠뒀어요.` : "장면별로 나눠서 보면 고르기 쉬워요."}</span>
      </div>
      <div className={s.analysisActions}>
        <PhotographerLightButton size="toolbar" onClick={() => goScene(null, "replace")}>장면별로 보기</PhotographerLightButton>
        <PhotographerLightButton variant="outline" size="toolbar" onClick={() => setPromptDismissed(true)}>계속 보기</PhotographerLightButton>
      </div>
    </div>
  ) : null;

  const sceneList = scenes?.map((item, index) => (
    <button key={index} type="button" className={s.railItem} aria-current={inTimeline && index === currentSection} onClick={() => { setSheet(null); goScene(index); }}>
      <strong>{sceneTitle(item)}</strong>
      <span>{sceneSub(item)}</span>
      <em className={sceneDone(item, index) ? s.done : ""}>{isOwner ? `${pickedInScene(item)}${targets[index] ? `/${targets[index]}` : ""}` : `♡${pickedInScene(item)}`}</em>
    </button>
  ));

  const peopleBar = (
    <div className={s.people}>
      {people.map((person) => {
        if (person.id === me) return <NicknamePrompt key={person.id} hex={person.hex} isDone={myDone} online={online.has(person.id)} />;
        const viewingId = project.participantViews?.[person.id];
        const viewing = viewingId && online.has(person.id) ? photoById.get(viewingId) : undefined;
        return viewing
          ? <button key={person.id} type="button" className={`${ui.participantPill} ${ui.participantViewTarget}`} onClick={() => setOpenPhotoId(viewing.id)} aria-label={`${person.name}님이 보는 사진 열기`}><i style={{ background: person.hex }} />{person.name}<span className={ui.participantOnline}>보는 중</span></button>
          : <span key={person.id} className={`${ui.participantPill} ${project.participantDone[person.id] ? ui.participantDone : ""}`}><i style={{ background: person.hex }} />{person.name}{project.participantDone[person.id] ? " 다 골랐어요" : ""}{online.has(person.id) ? <span className={ui.participantOnline}>온라인</span> : null}</span>;
      })}
      {isOwner && <button type="button" className={s.inviteButton} onClick={() => setSheet("invite")}><Plus size={14} />초대</button>}
    </div>
  );

  const card = (photo: Photo, columns: number) => {
    const groupId = photo.similarityGroupId ?? undefined;
    const members = groupId ? groupsInView.get(groupId) ?? [] : [];
    const isCover = grouped && hasGroups && members.length > 1 && !expanded.has(groupId!);
    const toggleGroup = () => groupId && setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
    return (
      <GalleryPhotoCard
        key={photo.id}
        token={projectId}
        href="#"
        photo={photo}
        selected={picked.has(photo.id)}
        showCheck={!isCover && !(columns >= 3 && typeof window !== "undefined" && window.innerWidth <= 767)}
        checkVariant={isOwner ? "check" : "heart"}
        showRating={false}
        colorTags={likesOf(photo.id)}
        colorLabel={(color: ColorTag) => `${project.participantNicknames[color] || "참가자"} 찜`}
        hasComment={Boolean(project.photoStates[photo.id]?.comment)}
        showGroupBadge={isCover}
        groupId={groupId}
        restCount={Math.max(0, members.length - 1)}
        totalCount={members.length}
        selectedCount={isOwner ? members.filter((member) => picked.has(member.id)).length : 0}
        isGroupExpanded={Boolean(groupId && expanded.has(groupId))}
        inExpandedGroup={Boolean(groupId && expanded.has(groupId) && members.length > 1)}
        presignedThumb={photo.url}
        thumbQueue={thumbQueue}
        viewerQueryString=""
        density={columns}
        showFilename={query.trim().length > 0}
        onPhotoClick={(event) => { event.preventDefault(); if (isCover) toggleGroup(); else setOpenPhotoId(photo.id); }}
        onCheckClick={(event) => { event.preventDefault(); event.stopPropagation(); if (isOwner) store.toggleSelect(photo.id); else store.toggleLike(photo.id, me); }}
        onGroupBadgeClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleGroup(); }}
        onRate={() => {}}
        onThumbError={() => {}}
      />
    );
  };

  const scopeChips: { value: Scope; label: string; show: boolean }[] = [
    { value: "all", label: "전체", show: true },
    { value: "picked", label: isOwner ? "✓ 고른 사진" : "✓ 최종 선택", show: true },
    { value: "mine", label: "♡ 내 찜", show: true },
    { value: "popular", label: "찜 2명 이상", show: people.length > 1 },
    { value: "quality", label: "흔들림·눈 감음 의심", show: hasQuality },
  ];

  const bottomBar = (() => {
    if (!isOwner) {
      return <>
        <div className={s.barMeta}><strong>내가 찜한 사진 {myLikes.size}장</strong><span>보정 받을 사진은 {project.participantNicknames.red || "소유자"}님이 정해요</span></div>
        <div className={s.barActions}>
          <PhotographerLightButton variant={myDone ? "outline" : "primary"} size="work-panel" onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>
        </div>
      </>;
    }
    const totalText = `${pickedTotal}장 선택${target ? ` · 약속한 ${target}장` : ""}`;
    if (showOverview) {
      return <>
        <div className={s.barMeta}><strong>{totalText}</strong><span>장면을 눌러 골라보세요</span></div>
        <div className={s.barActions}>
          <PhotographerLightButton variant="outline" size="work-panel" className={s.desktopOnly} disabled={!pickedTotal} onClick={toReview}>작가에게 보내기</PhotographerLightButton>
          <PhotographerLightButton size="work-panel" onClick={() => goScene(resumeScene)}>{pickedTotal ? "이어서 고르기" : "첫 장면부터 고르기"}</PhotographerLightButton>
        </div>
      </>;
    }
    const current = inTimeline ? scenes![currentSection] : null;
    return <>
      <div className={s.barMeta}>
        <strong>{current ? `${sceneTitle(current)} ${pickedInScene(current)}${targets[currentSection] ? ` / ${targets[currentSection]}장 정도` : "장"}` : totalText}</strong>
        <span>{current ? `전체 ${totalText}` : "목표와 달라도 보낼 수 있어요"}</span>
      </div>
      <div className={s.barActions}>
        <PhotographerLightButton size="work-panel" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>
      </div>
    </>;
  })();

  // 장면 사이 경계 카드: 방금 본 장면에서 고른 수와 다음 장면을 보여주며, 스크롤이 이 근처에서 살짝 멈춘다.
  const boundary = (index: number) => {
    const scene = scenes![index];
    const next = scenes![index + 1];
    const count = pickedInScene(scene);
    const done = isOwner
      ? count ? `${sceneTitle(scene)} ${count}${targets[index] ? ` / ${targets[index]}장 정도` : "장"} 골랐어요` : `${sceneTitle(scene)}에서 아직 안 골랐어요`
      : count ? `${sceneTitle(scene)}에서 ♡ ${count}장 찜했어요` : `${sceneTitle(scene)}에서 아직 찜 안 했어요`;
    return (
      <div className={s.boundaryCard}>
        <p className={`${s.boundaryDone} ${count ? "" : s.muted}`}>{count ? <CheckCircle2 size={16} aria-hidden /> : null}{done}</p>
        {next ? (
          <>
            <div className={s.boundaryNext}><span>다음 장면</span><strong>{sceneTitle(next)}</strong><span>{sceneSub(next)}</span><ArrowDown size={16} aria-hidden /></div>
            {/* 멈춘 채 더 내리면 진행선이 차오르고, 다 차면 다음 장면으로 넘어간다(TimelineGrid가 --pull 값을 준다). */}
            <div className={s.boundaryPull} aria-hidden><i /></div>
            <p className={s.boundaryHint} aria-hidden>계속 내리면 {sceneTitle(next)}(으)로 넘어가요</p>
          </>
        ) : (
          <div className={s.boundaryEnd}>
            <span>마지막 장면이에요 · 전체 {pickedTotal}장 {isOwner ? "선택" : "찜"}</span>
            {isOwner
              ? <PhotographerLightButton size="toolbar" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>
              : <PhotographerLightButton size="toolbar" variant={myDone ? "outline" : "primary"} onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>}
          </div>
        )}
      </div>
    );
  };
  const sectionHeader = (index: number, sticky = false) => (
    <button type="button" className={s.sectionTitle} onClick={() => setSheet("scenes")} aria-label={`${sceneTitle(scenes![index])} — 다른 장면으로 이동`}>
      <strong>{sceneTitle(scenes![index])}</strong>
      <span>{sticky ? `${index + 1} / ${scenes!.length}` : sceneSub(scenes![index])}</span>
      {sticky ? <ChevronDown size={15} aria-hidden /> : null}
    </button>
  );
  const sections: TimelineSection[] = sectioned
    ? scenes!.map((_, index) => ({ key: `scene-${index}`, header: sectionHeader(index), photos: visible.filter((photo) => sectionOf.get(photo.id) === index), boundary: boundary(index) }))
    : [{ key: "all", photos: visible }];

  return (
    <CustomerSelectShell
      viewportLocked
      compactHeader
      compactTitle={<ProjectStepHeader
        projectId={projectId}
        name={project.name}
        step="select"
        showSteps={isOwner}
        backHref={isOwner ? (inTimeline ? `/customer-select/${projectId}/select` : "/customer-select") : undefined}
        backLabel={inTimeline ? "장면 목록으로" : "내 프로젝트로"}
        onBack={(event) => { if (inTimeline) { event.preventDefault(); goScene(null, "replace"); } }}
      />}
      headerMeta={peopleBar}
    >
      <div className={s.page} data-chat={people.length > 1 ? "" : undefined}>
        <div className={s.mobilePeople}>{peopleBar}</div>

        {syncStatus === "offline" && <div role="status" className="border-b border-danger/20 bg-danger/8 px-5 py-2 text-center text-xs font-semibold text-danger">연결이 불안정해요. 다시 연결하고 있어요.</div>}
        {saveError && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-5 py-2 text-xs font-semibold text-danger"><span className="flex-1">{saveError}</span><button type="button" onClick={clearSaveError}>닫기</button></div>}

        <div className={s.body}>
          {inTimeline && scenes!.length > 1 && (
            <nav className={s.rail} aria-label="장면">
              <p className={s.railTitle}>장면</p>
              {sceneList}
              <div className={s.railFooter}>{isOwner ? <>전체 <strong>{pickedTotal}</strong>{target ? ` / ${target}` : ""}장</> : <>내 찜 <strong>{myLikes.size}</strong>장</>}</div>
            </nav>
          )}
          <div className={s.main}>
            {showOverview ? (
              <div className={s.overview}>
                <div className={s.overviewInner}>
                  <div className={s.overviewHead}>
                    <h2>장면별로 골라볼까요?</h2>
                    <p>{analysis.status === "ready" ? `AI가 ${scenes!.length}개 장면으로 정리했어요.` : analysis.status === "fallback" && analysis.failed ? `AI 정리를 하지 못해서 촬영 시간으로 ${scenes!.length}개 장면으로 나눴어요.` : `촬영 시간으로 ${scenes!.length}개 장면으로 나눴어요.`} {isOwner ? (target ? `약속한 ${target}장을 장면 크기에 맞춰 나눠 안내해요.` : "") : "마음에 드는 사진에 ♡를 눌러주세요."}</p>
                    {analysis.status === "fallback" && analysis.failed && isOwner && <p className={s.analysisFailed}><button type="button" onClick={() => setSheet("ai")}>AI 정리 다시 시도</button></p>}
                    <button type="button" className={s.textLink} onClick={() => goScene(0)}>처음부터 이어서 보기</button>
                  </div>
                  {scenes!.map((item, index) => {
                    const cover = photoById.get(item.photoIds.find((id) => picked.has(id)) ?? item.photoIds[0]);
                    const count = pickedInScene(item);
                    return (
                      <button key={index} type="button" className={s.sceneCard} onClick={() => goScene(index)}>
                        <span className={s.sceneCover}>{cover && <img src={cover.url} alt="" />}</span>
                        <span className={s.sceneText}><strong>{sceneTitle(item)}</strong><span>{sceneSub(item)}</span></span>
                        <span className={`${s.sceneProgress} ${sceneDone(item, index) ? s.done : count ? "" : s.empty}`}>{progressText(item, index)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {analysisBanner}
                {!sectioned && !analysisBanner && (
                  <div className={s.sceneHeader}>
                    <strong className={s.allTitle}>전체 사진 <small>촬영 시간순 · {photos.length.toLocaleString()}장</small></strong>
                    {scenes
                      ? <button type="button" className={s.textLink} onClick={() => goScene(null, "replace")}>장면별로 보기</button>
                      : analysis.status === "none" && isOwner && photos.length > 0 && <button type="button" className={s.aiButton} onClick={() => { setAiError(null); setSheet("ai"); }}><Sparkles size={14} />AI로 장면 정리</button>}
                  </div>
                )}
                <div className={s.tools} style={sectioned || analysisBanner ? { paddingTop: 10 } : undefined}>
                  {scopeChips.filter((chip) => chip.show).map((chip) => <button key={chip.value} type="button" className={s.chip} aria-pressed={scope === chip.value} onClick={() => setScope(chip.value)}>{chip.label}</button>)}
                  {hasGroups && <button type="button" className={s.chip} aria-pressed={grouped} onClick={() => { setGrouped((value) => !value); setExpanded(new Set()); }}><Layers size={13} />유사컷 묶기</button>}
                  <input className={s.search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
                  <button type="button" className={`${s.chip} ${s.columnsButton}`} aria-label={`한 줄에 ${mobileColumns}장 — 바꾸기`} onClick={() => setMobileColumns((value) => (value === 4 ? 2 : value + 1) as MobileColumns)}><Grid2x2 size={13} />{mobileColumns}열</button>
                </div>
                <TimelineGrid
                  sections={sections}
                  mobileColumns={mobileColumns}
                  positionKey={`ps:self-select:${projectId}:${sectioned ? "scenes" : "all"}:${scope}:${grouped ? 1 : 0}`}
                  renderCard={card}
                  empty={<><strong>조건에 맞는 사진이 없어요</strong><span>보기 조건을 바꿔보세요.</span><button type="button" onClick={() => { setScope("all"); setQuery(""); }}>전체 보기</button></>}
                  initialSection={initialSection}
                  jump={jump}
                  focus={focus}
                  onSectionChange={(index) => {
                    setCurrentSection(index);
                    // 지금 보는 장면을 주소에 조용히 남겨 새로고침·뒤로가기 때 같은 장면으로 돌아온다.
                    if (sectioned) window.history.replaceState(window.history.state, "", `?scene=${index}`);
                  }}
                  stickyHeader={sectioned ? (index) => sectionHeader(index, true) : undefined}
                />
              </>
            )}
            <div className={s.bottomBar}>{bottomBar}</div>
          </div>
        </div>
      </div>

      {sheet === "scenes" && scenes && <Sheet title="장면" onClose={() => setSheet(null)}><div className={s.sheetList}>{sceneList}</div><button type="button" className={s.textLink} onClick={() => { setSheet(null); goScene(null, "replace"); }}>장면 한눈에 보기</button></Sheet>}
      {sheet === "ai" && <AiTidySheet projectId={projectId} photoCount={photos.length} pending={aiPending} error={aiError} onStart={(kinds) => void startTidy(kinds)} onClose={() => setSheet(null)} />}
      {sheet === "invite" && <InviteSheet projectId={projectId} shareToken={project.shareToken} shareEnabled={project.shareEnabled} people={people} online={online} done={project.participantDone} onClose={() => setSheet(null)} />}

      {people.length > 1 && <EphemeralChat channelKey={project.realtimeKey} currentIdentity={me} nicknames={project.participantNicknames} hasRecipient={project.onlineParticipants?.some((color) => color !== me) ?? false} elevated={Boolean(openPhotoId)} />}

      {openPhotoId && (
        <PhotoDetail
          photos={filtered.some((photo) => photo.id === openPhotoId) ? filtered : photos}
          photoId={openPhotoId}
          onPhotoChange={setOpenPhotoId}
          onClose={() => {
            // 마지막으로 본 사진이 접힌 유사컷 안에 있으면 그 묶음의 표지 위치로 돌아간다.
            const last = photoById.get(openPhotoId);
            const target = visible.some((photo) => photo.id === openPhotoId) ? openPhotoId
              : visible.find((photo) => last?.similarityGroupId && photo.similarityGroupId === last.similarityGroupId)?.id;
            if (target) setFocus({ photoId: target, nonce: Date.now() });
            setOpenPhotoId(null);
          }}
          isOwner={isOwner}
          myColor={me}
          people={people}
          selectedIds={selectedIds}
          likesOf={likesOf}
          commentOf={(photoId) => project.photoStates[photoId]?.comment ?? ""}
          similarOf={similarOf}
          commentSaveStates={store.commentSaveStates}
          onToggleSelect={store.toggleSelect}
          onToggleLike={(photoId) => store.toggleLike(photoId, me)}
          onSaveComment={store.setComment}
          selectedCount={selectedIds.size}
          target={target}
        />
      )}
    </CustomerSelectShell>
  );
}
