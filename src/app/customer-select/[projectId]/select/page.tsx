"use client";

/**
 * 셀프 고객 셀렉 ② 고르기.
 * 촬영 시각으로 나눈 "장면"이 화면의 뼈대다 — 2,000장을 장면 몇 개의 작은 일로 쪼갠다.
 * 역할마다 메인 동작은 하나다: 소유자는 ✓ 보정 받기, 참여자는 ♡ 찜.
 * 격자는 고르는 곳, 상세는 고민하는 곳. 유사컷 묶음 표지는 바로 고르지 않고 펼쳐서 비교한다.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Grid2x2, Layers, Plus } from "lucide-react";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { formatSceneRange, sceneTargets, splitScenes, type Scene } from "@/lib/customer-scenes";
import type { ColorTag, Photo } from "@/types";
import { activeParticipants, useCustomerSelectStore } from "../../_lib/real-store";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { ProjectStepHeader } from "../../_lib/ProjectStepHeader";
import { NicknamePrompt } from "../../_lib/NicknamePrompt";
import { ParticipantAccessEndedScreen, ParticipantJoinScreen } from "../../_lib/ParticipantJoinScreen";
import { EphemeralChat } from "../../_lib/EphemeralChat";
import ui from "../../_lib/ui.module.css";
import { PhotoGrid, type MobileColumns } from "./PhotoGrid";
import { PhotoDetail } from "./PhotoDetail";
import { InviteSheet, Sheet } from "./Sheets";
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
  const [grouped, setGrouped] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"invite" | "scenes" | null>(null);

  const photos = project.photos;
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const scenes = useMemo(() => splitScenes(photos), [photos]);
  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const likesOf = useCallback((photoId: string) => project.photoStates[photoId]?.color ?? [], [project.photoStates]);
  const myLikes = useMemo(() => new Set(photos.filter((photo) => likesOf(photo.id).includes(me)).map((photo) => photo.id)), [likesOf, me, photos]);
  // 역할별 "고른 사진": 소유자는 최종 선택, 참여자는 내 찜.
  const picked = isOwner ? selectedIds : myLikes;
  const people = useMemo(() => activeParticipants(project), [project]);
  const online = useMemo(() => new Set<string>(project.onlineParticipants ?? []), [project.onlineParticipants]);
  const targets = useMemo(() => scenes ? sceneTargets(scenes.map((scene) => scene.photoIds.length), project.target) : [], [project.target, scenes]);

  const sceneParam = searchParams.get("scene");
  const sceneIndex = scenes && sceneParam !== null && Number(sceneParam) >= 0 && Number(sceneParam) < scenes.length ? Number(sceneParam) : null;
  const scene = sceneIndex === null ? null : scenes![sceneIndex];
  const showOverview = Boolean(scenes) && !scene;

  const scenePhotos = useMemo(
    () => scene ? scene.photoIds.flatMap((id) => photoById.get(id) ?? []) : scenes ? [] : photos,
    [photoById, photos, scene, scenes],
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
  const pickedInScene = useCallback((target: Scene) => target.photoIds.filter((id) => picked.has(id)).length, [picked]);

  const goScene = useCallback((index: number | null, mode: "push" | "replace" = "push") => {
    setScope("all");
    setQuery("");
    setExpanded(new Set());
    const url = index === null ? `/customer-select/${projectId}/select` : `/customer-select/${projectId}/select?scene=${index}`;
    if (mode === "push") router.push(url, { scroll: false }); else router.replace(url, { scroll: false });
  }, [projectId, router]);

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
  const nextScene = scenes && sceneIndex !== null && sceneIndex < scenes.length - 1 ? sceneIndex + 1 : null;
  const resumeScene = scenes ? Math.max(0, scenes.findIndex((item, index) => pickedInScene(item) < (isOwner ? targets[index] : 1))) : 0;
  const hasQuality = scenePhotos.some((photo) => photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
  const myDone = Boolean(project.participantDone[me]);
  const toReview = () => router.push(`/customer-select/${projectId}/review`);

  const sceneTitle = (item: Scene) => scenes && scenes.length > 1 ? formatSceneRange(item) : "전체 사진";
  const progressText = (item: Scene, index: number) => {
    const count = pickedInScene(item);
    if (!isOwner) return count ? `♡ 내 찜 ${count}장` : "아직 찜 안 했어요";
    if (!count) return "아직 안 골랐어요";
    return targets[index] ? `✓ ${count} / ${targets[index]}장 정도` : `✓ ${count}장`;
  };
  const sceneDone = (item: Scene, index: number) => isOwner && targets[index] > 0 && pickedInScene(item) >= targets[index];

  const sceneList = scenes?.map((item, index) => (
    <button key={index} type="button" className={s.railItem} aria-current={index === sceneIndex} onClick={() => { setSheet(null); goScene(index, sceneIndex === null ? "push" : "replace"); }}>
      <strong>{sceneTitle(item)}</strong>
      <span>{item.photoIds.length}장</span>
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
          {nextScene !== null && <PhotographerLightButton variant="outline" size="work-panel" className={s.desktopOnly} onClick={() => goScene(nextScene, "replace")}>다음 장면</PhotographerLightButton>}
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
    return <>
      <div className={s.barMeta}>
        <strong>{scene ? `이 장면 ${pickedInScene(scene)}${targets[sceneIndex!] ? ` / ${targets[sceneIndex!]}장 정도` : "장"}` : totalText}</strong>
        <span>{scene ? `전체 ${totalText}` : "목표와 달라도 보낼 수 있어요"}</span>
      </div>
      <div className={s.barActions}>
        {nextScene !== null && <PhotographerLightButton variant="outline" size="work-panel" className={s.desktopOnly} disabled={!pickedTotal} onClick={toReview}>작가에게 보내기</PhotographerLightButton>}
        {nextScene !== null
          ? <PhotographerLightButton size="work-panel" onClick={() => goScene(nextScene, "replace")}>다음 장면 →</PhotographerLightButton>
          : <PhotographerLightButton size="work-panel" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>}
      </div>
    </>;
  })();

  return (
    <CustomerSelectShell
      viewportLocked
      compactHeader
      compactTitle={<ProjectStepHeader
        projectId={projectId}
        name={project.name}
        step="select"
        showSteps={isOwner}
        backHref={isOwner ? (scene ? `/customer-select/${projectId}/select` : "/customer-select") : undefined}
        backLabel={scene ? "장면 목록으로" : "내 프로젝트로"}
        onBack={(event) => { if (scene) { event.preventDefault(); goScene(null, "replace"); } }}
      />}
      headerMeta={peopleBar}
    >
      <div className={s.page}>
        <div className={s.mobilePeople}>{peopleBar}</div>

        {syncStatus === "offline" && <div role="status" className="border-b border-danger/20 bg-danger/8 px-5 py-2 text-center text-xs font-semibold text-danger">연결이 불안정해요. 다시 연결하고 있어요.</div>}
        {saveError && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-5 py-2 text-xs font-semibold text-danger"><span className="flex-1">{saveError}</span><button type="button" onClick={clearSaveError}>닫기</button></div>}

        <div className={s.body}>
          {scenes && scenes.length > 1 && !showOverview && (
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
                    <p>촬영 시간으로 {scenes!.length}개 장면으로 나눴어요. {isOwner ? (target ? `약속한 ${target}장을 장면 크기에 맞춰 나눠 안내해요.` : "") : "마음에 드는 사진에 ♡를 눌러주세요."}</p>
                  </div>
                  {scenes!.map((item, index) => {
                    const cover = photoById.get(item.photoIds.find((id) => picked.has(id)) ?? item.photoIds[0]);
                    const count = pickedInScene(item);
                    return (
                      <button key={index} type="button" className={s.sceneCard} onClick={() => goScene(index)}>
                        <span className={s.sceneCover}>{cover && <img src={cover.url} alt="" />}</span>
                        <span className={s.sceneText}><strong>{sceneTitle(item)}</strong><span>{item.photoIds.length}장</span></span>
                        <span className={`${s.sceneProgress} ${sceneDone(item, index) ? s.done : count ? "" : s.empty}`}>{progressText(item, index)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {scene && (
                  <div className={s.sceneHeader}>
                    <button type="button" className={s.scenePicker} onClick={() => setSheet("scenes")} aria-label="다른 장면 고르기">
                      <strong>{sceneTitle(scene)}</strong><ChevronDown size={16} /><small>{sceneIndex! + 1} / {scenes!.length}</small>
                    </button>
                    <span className={s.sceneMeta}>{scene.photoIds.length}장</span>
                  </div>
                )}
                <div className={s.tools} style={scene ? undefined : { paddingTop: 10 }}>
                  {scopeChips.filter((chip) => chip.show).map((chip) => <button key={chip.value} type="button" className={s.chip} aria-pressed={scope === chip.value} onClick={() => setScope(chip.value)}>{chip.label}</button>)}
                  {hasGroups && <button type="button" className={s.chip} aria-pressed={grouped} onClick={() => { setGrouped((value) => !value); setExpanded(new Set()); }}><Layers size={13} />유사컷 묶기</button>}
                  <input className={s.search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명 검색" aria-label="파일명 검색" />
                  <button type="button" className={`${s.chip} ${s.columnsButton}`} aria-label={`한 줄에 ${mobileColumns}장 — 바꾸기`} onClick={() => setMobileColumns((value) => (value === 4 ? 2 : value + 1) as MobileColumns)}><Grid2x2 size={13} />{mobileColumns}열</button>
                </div>
                <PhotoGrid
                  photos={visible}
                  mobileColumns={mobileColumns}
                  positionKey={`ps:self-select:${projectId}:${sceneIndex ?? "all"}:${scope}:${grouped ? 1 : 0}`}
                  renderCard={card}
                  empty={<><strong>조건에 맞는 사진이 없어요</strong><span>보기 조건을 바꿔보세요.</span><button type="button" onClick={() => { setScope("all"); setQuery(""); }}>전체 보기</button></>}
                />
              </>
            )}
            <div className={s.bottomBar}>{bottomBar}</div>
          </div>
        </div>
      </div>

      {sheet === "scenes" && scenes && <Sheet title="장면" onClose={() => setSheet(null)}><div className={s.sheetList}>{sceneList}</div><button type="button" className={s.textLink} onClick={() => { setSheet(null); goScene(null, "replace"); }}>장면 한눈에 보기</button></Sheet>}
      {sheet === "invite" && <InviteSheet projectId={projectId} shareToken={project.shareToken} shareEnabled={project.shareEnabled} people={people} online={online} done={project.participantDone} onClose={() => setSheet(null)} />}

      {people.length > 1 && !openPhotoId && <EphemeralChat channelKey={project.realtimeKey} currentIdentity={me} nicknames={project.participantNicknames} hasRecipient={project.onlineParticipants?.some((color) => color !== me) ?? false} elevated={Boolean(openPhotoId)} />}

      {openPhotoId && (
        <PhotoDetail
          photos={filtered.some((photo) => photo.id === openPhotoId) ? filtered : photos}
          photoId={openPhotoId}
          onPhotoChange={setOpenPhotoId}
          onClose={() => setOpenPhotoId(null)}
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
