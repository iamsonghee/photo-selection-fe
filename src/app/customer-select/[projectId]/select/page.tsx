"use client";

/**
 * 셀프 고객 셀렉 ② 고르기.
 * 촬영 시각(이후 AI)으로 나눈 "장면"이 화면의 뼈대다 — 2,000장을 장면 몇 개의 작은 일로 쪼갠다.
 * 한 번에 한 장면을 보고, 장면 끝에서 쭉 당기면 다음 장면으로 넘어간다. 장면 이동은 퀵메뉴가 맡는다.
 * 역할마다 메인 동작은 하나다: 소유자는 ✓ 보정 받기, 참여자는 ♡ 찜.
 * 격자는 고르는 곳, 상세는 고민하는 곳. 유사컷 묶음 표지는 바로 고르지 않고 펼쳐서 비교한다.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ChevronUp, Grid2x2, Layers, MessageCircle, PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
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
import { SceneGrid, type MobileColumns } from "./SceneGrid";
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
  const lastSceneKey = `ps:self-select-scene:${projectId}`;

  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [scope, setScope] = useState<Scope>("all");
  const [grouped, setGrouped] = useState(() => {
    try { return localStorage.getItem(groupSimilarKey(projectId)) !== "0"; } catch { return true; }
  });
  const [query, setQuery] = useState("");
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"invite" | "scenes" | "ai" | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ photoId: string; nonce: number } | null>(null);
  // 주소(?scene=N) → 이 탭에서 마지막으로 본 장면 → 아직 덜 고른 첫 장면 순서로 시작한다.
  const [chosenScene, setChosenScene] = useState<number | null>(() => {
    const fromUrl = searchParams.get("scene");
    if (fromUrl !== null && Number.isInteger(Number(fromUrl))) return Number(fromUrl);
    try { const stored = sessionStorage.getItem(lastSceneKey); return stored === null ? null : Number(stored); } catch { return null; }
  });
  // 당겨서 넘어온 방향: 다음 장면(아래에서 올라옴·처음부터) / 이전 장면(위에서 내려옴·끝부터)
  const [enteredBy, setEnteredBy] = useState<"next" | "prev" | null>(null);
  // PC 장면 사이드바 접기(기기별 보기 설정). 접으면 작은 퀵메뉴로 바뀐다.
  const railCollapsedKey = "ps:self-select-rail-collapsed";
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem(railCollapsedKey) === "1"; } catch { return false; }
  });
  const toggleRail = (collapsed: boolean) => {
    setRailCollapsed(collapsed);
    try { localStorage.setItem(railCollapsedKey, collapsed ? "1" : "0"); } catch {}
  };

  const analysis = useSceneAnalysis(projectId, project.photos, project.shootType);
  const photos = analysis.photos;
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
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
  const pickedInScene = useCallback((target: NamedScene) => target.photoIds.filter((id) => picked.has(id)).length, [picked]);

  // 장면이 있으면 한 번에 한 장면, 정리 전·정리 중이면 촬영 시간순 한 목록.
  const sceneMode = Boolean(scenes) && !holdAll;
  const resumeScene = scenes ? Math.max(0, scenes.findIndex((item, index) => pickedInScene(item) < (isOwner ? targets[index] : 1))) : 0;
  const sceneIndex = sceneMode ? Math.min(Math.max(chosenScene ?? resumeScene, 0), scenes!.length - 1) : null;
  const scene = sceneIndex === null ? null : scenes![sceneIndex];
  const nextScene = scenes && sceneIndex !== null && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null;
  const prevScene = scenes && sceneIndex !== null && sceneIndex > 0 ? scenes[sceneIndex - 1] : null;

  const scenePhotos = useMemo(
    () => scene ? scene.photoIds.flatMap((id) => photoById.get(id) ?? []) : timeOrdered,
    [photoById, scene, timeOrdered],
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
      if (!groupId || (groupsInView.get(groupId)?.length ?? 0) < 2) return true;
      return covers.get(groupId) === photo.id;
    });
  }, [filtered, grouped, groupsInView, hasGroups, picked]);
  // 묶기가 켜져 있으면 표지 한 칸에 든 사진들(상세에서 ↑↓·띠로 본다). 아니면 빈 목록.
  const membersOf = useCallback((photo: Photo) => {
    if (!grouped || !hasGroups || !photo.similarityGroupId) return [];
    const members = groupsInView.get(photo.similarityGroupId) ?? [];
    return members.length > 1 ? members : [];
  }, [grouped, groupsInView, hasGroups]);

  const similarOf = useCallback((photo: Photo) => photo.similarityGroupId ? photos.filter((member) => member.similarityGroupId === photo.similarityGroupId) : [], [photos]);

  async function startTidy(kinds: AiTidyKind[]) {
    setAiPending(true);
    setAiError(null);
    const error = await analysis.start(kinds);
    setAiPending(false);
    if (error) setAiError(error);
    else setSheet(null);
  }

  /** 다른 장면으로 이동. 당겨서 넘어온 장면은 처음부터, 퀵메뉴로 고른 장면은 마지막으로 보던 곳부터 본다. */
  function goScene(index: number, byPull: "next" | "prev" | null = null) {
    setScope("all");
    setQuery("");
    setHoldAll(false);
    setSheet(null);
    setChosenScene(index);
    setEnteredBy(byPull);
    // 지금 보는 장면을 주소와 이 탭에 남겨 새로고침·재진입 때 같은 장면으로 돌아온다.
    window.history.replaceState(window.history.state, "", `?scene=${index}`);
    try { sessionStorage.setItem(lastSceneKey, String(index)); } catch {}
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
  const hasQuality = scenePhotos.some((photo) => photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
  const myDone = Boolean(project.participantDone[me]);
  const toReview = () => router.push(`/customer-select/${projectId}/review`);
  const withChat = people.length > 1;

  // AI 장면은 이름이 제목, 시간대는 보조 정보. 이름이 없으면(시간 장면) 시간대가 제목이다.
  const sceneTitle = (item: NamedScene) => item.name ?? (scenes && scenes.length > 1 ? formatSceneRange(item) : "전체 사진");
  const sceneCount = (index: number) => {
    const count = pickedInScene(scenes![index]);
    return isOwner ? `${count}${targets[index] ? `/${targets[index]}` : ""}` : count ? `♡${count}` : "";
  };
  const sceneDone = (index: number) => isOwner && targets[index] > 0 && pickedInScene(scenes![index]) >= targets[index];

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
        <PhotographerLightButton size="toolbar" onClick={() => goScene(resumeScene)}>장면별로 보기</PhotographerLightButton>
        <PhotographerLightButton variant="outline" size="toolbar" onClick={() => setPromptDismissed(true)}>계속 보기</PhotographerLightButton>
      </div>
    </div>
  ) : null;

  const failedNotice = analysis.status === "fallback" && analysis.failed && isOwner
    ? <button type="button" className={s.quickNotice} onClick={() => setSheet("ai")}>AI 정리 실패 · 다시 시도</button>
    : null;
  const sceneItems = scenes?.map((item, index) => (
    <button key={index} type="button" className={s.quickItem} aria-current={index === sceneIndex} onClick={() => goScene(index)}>
      <span>{sceneTitle(item)}</span>
      <em className={sceneDone(index) ? s.done : ""}>{sceneCount(index)}</em>
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
    const isCover = grouped && hasGroups && members.length > 1;
    return (
      <GalleryPhotoCard
        key={photo.id}
        token={projectId}
        href="#"
        photo={photo}
        // 표지는 "묶음 하나"라 표지 사진의 선택 스타일(어둡게·테두리)을 쓰지 않는다 — 묶음 안 선택 수는 배지로 보인다.
        selected={!isCover && picked.has(photo.id)}
        highlighted={isCover && members.some((member) => picked.has(member.id))}
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
        isGroupExpanded={false}
        presignedThumb={photo.url}
        thumbQueue={thumbQueue}
        viewerQueryString=""
        density={columns}
        showFilename={query.trim().length > 0}
        onPhotoClick={(event) => { event.preventDefault(); setOpenPhotoId(photo.id); }}
        onCheckClick={(event) => { event.preventDefault(); event.stopPropagation(); if (isOwner) store.toggleSelect(photo.id); else store.toggleLike(photo.id, me); }}
        onLikeClick={isOwner && !isCover ? (event) => { event.preventDefault(); event.stopPropagation(); store.toggleLike(photo.id, me); } : undefined}
        liked={isOwner && myLikes.has(photo.id)}
        popOnSelect
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

  // 장면 끝의 얇은 안내: 다음 장면 이름(당기면 넘어간다는 신호), 마지막 장면이면 보내기.
  const sceneFooter = scene ? (nextScene
    ? <p className={s.sceneNext}><ArrowDown size={14} aria-hidden /><span>다음</span><strong>{sceneTitle(nextScene)}</strong></p>
    : <div className={s.sceneEnd}>
        <span>마지막 장면 · 전체 {pickedTotal}장 {isOwner ? "선택" : "찜"}</span>
        {isOwner
          ? <PhotographerLightButton size="toolbar" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>
          : <PhotographerLightButton size="toolbar" variant={myDone ? "outline" : "primary"} onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>}
      </div>) : undefined;

  const totalText = `${pickedTotal}장 선택${target ? ` · 약속한 ${target}장` : ""}`;
  const bottomBar = !isOwner ? <>
    <div className={s.barMeta}><strong>내가 찜한 사진 {myLikes.size}장</strong><span>보정 받을 사진은 {project.participantNicknames.red || "소유자"}님이 정해요</span></div>
    <div className={s.barActions}>
      <PhotographerLightButton variant={myDone ? "outline" : "primary"} size="work-panel" onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>
    </div>
  </> : <>
    <div className={s.barMeta}>
      <strong>{scene ? `${sceneTitle(scene)} ${pickedInScene(scene)}${targets[sceneIndex!] ? ` / ${targets[sceneIndex!]}장 정도` : "장"}` : totalText}</strong>
      <span>{scene ? `전체 ${totalText}` : "목표와 달라도 보낼 수 있어요"}</span>
    </div>
    <div className={s.barActions}>
      <PhotographerLightButton size="work-panel" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>
    </div>
  </>;

  return (
    <CustomerSelectShell
      viewportLocked
      compactHeader
      compactTitle={<ProjectStepHeader projectId={projectId} name={project.name} step="select" showSteps={isOwner} backHref={isOwner ? "/customer-select" : undefined} />}
      headerMeta={peopleBar}
    >
      <div className={s.page} data-chat={withChat ? "" : undefined}>
        <div className={s.mobilePeople}>{peopleBar}</div>

        {syncStatus === "offline" && <div role="status" className="border-b border-danger/20 bg-danger/8 px-5 py-2 text-center text-xs font-semibold text-danger">연결이 불안정해요. 다시 연결하고 있어요.</div>}
        {saveError && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-5 py-2 text-xs font-semibold text-danger"><span className="flex-1">{saveError}</span><button type="button" onClick={clearSaveError}>닫기</button></div>}

        <div className={s.body}>
          {/* PC 장면 사이드바: 장면 목차(지금 장면·장면별 고른 수)와 대화. 접으면 작은 퀵메뉴가 대신한다. */}
          {sceneMode && scenes && !railCollapsed && (
            <nav className={s.rail} aria-label="장면">
              <div className={s.railHead}>
                <strong>장면</strong>
                <button type="button" className={s.railToggle} onClick={() => toggleRail(true)} aria-label="장면 목록 접기" title="장면 목록 접기"><PanelLeftClose size={16} /></button>
              </div>
              <div className={s.quickList}>{sceneItems}</div>
              {failedNotice}
              <div className={s.railFooter}>
                <span>{isOwner ? <>전체 <strong>{pickedTotal}</strong>{target ? ` / ${target}` : ""}장</> : <>내 찜 <strong>{myLikes.size}</strong>장</>}</span>
                {withChat && <button type="button" className={s.quickChat} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)}><MessageCircle size={15} />대화</button>}
              </div>
            </nav>
          )}
          <div className={`${s.main} ${sceneMode ? s.mainWithQuick : ""} ${sceneMode && railCollapsed ? s.mainFloatNav : ""}`}>
            {analysisBanner}
            {!sceneMode && !analysisBanner && (
              <div className={s.sceneHeader}>
                <strong className={s.allTitle}>전체 사진 <small>촬영 시간순 · {photos.length.toLocaleString()}장</small></strong>
                {scenes
                  ? <button type="button" className={s.textLink} onClick={() => goScene(resumeScene)}>장면별로 보기</button>
                  : analysis.status === "none" && isOwner && photos.length > 0 && <button type="button" className={s.aiButton} onClick={() => { setAiError(null); setSheet("ai"); }}><Sparkles size={14} />AI로 장면 정리</button>}
              </div>
            )}
            <div className={s.tools} style={sceneMode || analysisBanner ? { paddingTop: 10 } : undefined}>
              {scopeChips.filter((chip) => chip.show).map((chip) => <button key={chip.value} type="button" className={s.chip} aria-pressed={scope === chip.value} onClick={() => setScope(chip.value)}>{chip.label}</button>)}
              {hasGroups && <button type="button" className={s.chip} aria-pressed={grouped} onClick={() => setGrouped((value) => !value)}><Layers size={13} />유사컷 묶기</button>}
              <input className={s.search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
              <button type="button" className={`${s.chip} ${s.columnsButton}`} aria-label={`한 줄에 ${mobileColumns}장 — 바꾸기`} onClick={() => setMobileColumns((value) => (value === 4 ? 2 : value + 1) as MobileColumns)}><Grid2x2 size={13} />{mobileColumns}열</button>
            </div>
            <SceneGrid
              key={sceneMode ? `scene-${sceneIndex}` : "all"}
              photos={visible}
              mobileColumns={mobileColumns}
              positionKey={`ps:self-select:${projectId}:${sceneMode ? `s${sceneIndex}` : "all"}:${scope}:${grouped ? 1 : 0}`}
              startAt={enteredBy === "next" ? "top" : enteredBy === "prev" ? "bottom" : null}
              enterFrom={enteredBy === "next" ? "below" : null}
              renderCard={card}
              empty={<><strong>조건에 맞는 사진이 없어요</strong><span>보기 조건을 바꿔보세요.</span><button type="button" onClick={() => { setScope("all"); setQuery(""); }}>전체 보기</button></>}
              footer={sceneFooter}
              next={nextScene ? { label: sceneTitle(nextScene), onPass: () => goScene(sceneIndex! + 1, "next") } : null}
              prev={prevScene ? { label: sceneTitle(prevScene), onPass: () => goScene(sceneIndex! - 1, "prev") } : null}
              focus={focus}
            />

            {/* 퀵메뉴: 장면 목차(지금 장면·장면별 고른 수)와 대화. PC는 오른쪽 세로 목록, 모바일은 떠 있는 버튼 → 장면 시트. */}
            {sceneMode && scenes && (
              <>
                {/* PC에서 사이드바를 접으면: 왼쪽 가운데 장면 점 메뉴. 올리면 장면 이름이 펼쳐진다. */}
                {railCollapsed && (
                  <nav className={s.floatNav} aria-label="장면">
                    <button type="button" className={s.floatTool} onClick={() => toggleRail(false)} aria-label="장면 목록 펼치기" title="장면 목록 펼치기"><PanelLeftOpen size={16} /><span className={s.floatLabel}>장면 목록 펼치기</span></button>
                    {scenes.map((item, index) => {
                      const count = pickedInScene(item);
                      return (
                        <button key={index} type="button" className={s.floatItem} aria-current={index === sceneIndex} data-state={sceneDone(index) ? "done" : count ? "some" : undefined} onClick={() => goScene(index)} aria-label={`${sceneTitle(item)} ${sceneCount(index)}`}>
                          <i aria-hidden />
                          <span className={s.floatLabel}>{sceneTitle(item)}</span>
                          <em className={s.floatLabel}>{sceneCount(index)}</em>
                        </button>
                      );
                    })}
                    {withChat && <button type="button" className={s.floatTool} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)} aria-label={chatOpen ? "대화 닫기" : "대화 열기"}><MessageCircle size={16} /><span className={s.floatLabel}>대화</span></button>}
                  </nav>
                )}
                <div className={s.quickPill}>
                  <button type="button" className={s.quickPillScene} onClick={() => setSheet("scenes")} aria-label="장면 목록 열기">
                    <i aria-hidden />
                    <strong>{sceneTitle(scene!)}</strong>
                    <span>{sceneIndex! + 1}/{scenes.length}</span>
                    <ChevronUp size={15} aria-hidden />
                  </button>
                  {withChat && <button type="button" className={s.quickPillChat} aria-label={chatOpen ? "대화 닫기" : "대화 열기"} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)}><MessageCircle size={17} /></button>}
                </div>
              </>
            )}
            <div className={s.bottomBar}>{bottomBar}</div>
          </div>
        </div>
      </div>

      {sheet === "scenes" && scenes && <Sheet title="장면" onClose={() => setSheet(null)}><div className={s.sheetList}>{sceneItems}</div>{failedNotice}</Sheet>}
      {sheet === "ai" && <AiTidySheet projectId={projectId} photoCount={photos.length} pending={aiPending} error={aiError} onStart={(kinds) => void startTidy(kinds)} onClose={() => setSheet(null)} />}
      {sheet === "invite" && <InviteSheet projectId={projectId} shareToken={project.shareToken} shareEnabled={project.shareEnabled} people={people} online={online} done={project.participantDone} onClose={() => setSheet(null)} />}

      {withChat && <EphemeralChat
        channelKey={project.realtimeKey}
        currentIdentity={me}
        nicknames={project.participantNicknames}
        hasRecipient={project.onlineParticipants?.some((color) => color !== me) ?? false}
        elevated={Boolean(openPhotoId)}
        {...(sceneMode ? { open: chatOpen, onOpenChange: setChatOpen } : {})}
      />}

      {openPhotoId && (
        <PhotoDetail
          // ‹ › 는 갤러리에 보이는 칸 순서(접힌 묶음은 한 칸). 보기 조건 밖 사진을 열었으면 전체를 한 장씩.
          photos={filtered.some((photo) => photo.id === openPhotoId) ? visible : photos}
          membersOf={filtered.some((photo) => photo.id === openPhotoId) ? membersOf : undefined}
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
