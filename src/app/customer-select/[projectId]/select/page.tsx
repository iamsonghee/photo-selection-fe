"use client";

/**
 * 셀프 고객 셀렉 ② 고르기.
 * 촬영 시각(이후 AI)으로 나눈 "장면"이 화면의 뼈대다 — 수천 장을 장면 몇 개의 작은 일로 쪼갠다.
 * 한 번에 한 장면을 보고, 장면 끝에서 쭉 당기면 다음 장면으로 넘어간다. 장면 이동은 퀵메뉴가 맡는다.
 * 역할마다 메인 동작은 하나다: 소유자는 ✓ 최종 선택, 참여자는 ♡ 찜.
 * 격자는 고르는 곳, 상세는 고민하는 곳. 유사컷 묶음 표지는 바로 고르지 않고 펼쳐서 비교한다.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ChevronUp, MessageCircle, Grid2x2, Grid3x3, Grip, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectBodySkeleton } from "../../_lib/ProjectBodySkeleton";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { formatSceneRange, sceneTargets } from "@/lib/customer-scenes";
import type { PeopleKind, Photo } from "@/types";
import { activeParticipants, useCustomerSelectStore } from "../../_lib/real-store";
import { useProjectShell } from "../../_lib/ProjectShell";
import { ParticipantAccessEndedScreen, ParticipantJoinScreen } from "../../_lib/ParticipantJoinScreen";
import { EphemeralChat } from "../../_lib/EphemeralChat";
import { SceneGrid, type MobileColumns } from "./SceneGrid";
import { PhotoDetail } from "./PhotoDetail";
import { Sheet } from "./Sheets";
import { taskProgressText, useSceneAnalysis, type NamedScene } from "./useSceneAnalysis";
import { AiTidySheet, groupSimilarKey, rememberGroupSimilar, setAsideKey, type AiTidyKind } from "./AiTidySheet";
import s from "./select.module.css";

type Scope = "all" | "picked" | "liked";
const CHAT_ENABLED = false;
// 인물 구성(AI 판정) 칩 순서·이름. 돌잔치는 단독 컷이 대부분 아기라 이름을 바꿔 보인다.
const PEOPLE_KINDS: readonly PeopleKind[] = ["solo", "family", "group", "none"];
const peopleLabel = (kind: PeopleKind, shootType: string | null) =>
  ({ solo: shootType === "first_birthday" ? "아기 단독" : "단독", family: "가족·소수", group: "여러 명", none: "사람 없음" })[kind];

/** AI가 흔들림(흐림) 또는 눈 감음을 의심한 사진 — 유사컷 묶음 안에서 맨 뒤로 보낸다(비슷한 컷 중 멀쩡한 것부터). */
const isFlagged = (photo: Photo) => Boolean(photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
/** 갤러리에서 빼는 건 흔들림(흐림)만 — 눈 감음은 웃음·윙크 같은 의도된 표정이 많아 숨기지 않는다. */
const isBlurFlagged = (photo: Photo) => photo.isBlurry === true;

const sizeLabel: Record<MobileColumns, string> = { 2: "크게", 3: "중간", 4: "작게" };
// 보기 크기 버튼은 누를 때마다 바로 다음 크기로(크게 → 중간 → 작게 → 크게). 아이콘이 지금 크기를 보여준다.
const nextColumns: Record<MobileColumns, MobileColumns> = { 2: 3, 3: 4, 4: 2 };

export default function CustomerSelectPage() {
  return <Suspense fallback={<ProjectBodySkeleton variant="gallery" label="사진을 불러오고 있어요" />}><SelectScreen /></Suspense>;
}

function SelectScreen() {
  const projectId = useParams().projectId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useCustomerSelectStore();
  const { project, hydrated, isOwner, currentIdentity: me, participantReady, accessDenied, syncStatus, saveError, clearSaveError, failedComments, retryFailedComments } = store;
  const failedMemoCount = Object.keys(failedComments).length;
  // 초대 링크(`?invite=1`, 미들웨어가 붙임)로 들어오면 참여한 적이 있어도 초대 화면을 먼저 보여준다(작가 고객 초대와 같은 흐름).
  const [inviteSeen, setInviteSeen] = useState(false);
  useEffect(() => {
    if (searchParams.get("invite") !== "1") return;
    const controller = new AbortController();
    fetch(`/api/customer-select/projects/${projectId}/invite-cover`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.url && !controller.signal.aborted) {
          const image = new Image();
          image.fetchPriority = "high";
          image.src = data.url;
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [projectId, searchParams]);
  const enterFromInvite = () => {
    setInviteSeen(true);
    if (searchParams.get("invite")) router.replace(`/customer-select/${projectId}/select`, { scroll: false });
  };
  const lastSceneKey = `ps:self-select-scene:${projectId}`;

  const [thumbQueue] = useState(() => createThumbLoadQueue(12));
  const [scope, setScope] = useState<Scope>("all");
  const [grouped, setGrouped] = useState(() => {
    try { return localStorage.getItem(groupSimilarKey(projectId)) !== "0"; } catch { return true; }
  });
  const [setAside, setSetAside] = useState(() => {
    try { return localStorage.getItem(setAsideKey(projectId)) === "1"; } catch { return false; }
  });
  const toggleSetAside = (on: boolean) => {
    setSetAside(on);
    try { localStorage.setItem(setAsideKey(projectId), on ? "1" : "0"); } catch {}
  };
  const [query, setQuery] = useState("");
  // 인물 구성 칩 선택은 고른 장면에서만 유지한다 — 다른 장면엔 그 구성이 없을 수 있다(빈 화면 방지).
  const [peoplePick, setPeoplePick] = useState<{ scene: number | null; kind: PeopleKind } | null>(null);
  // 툴바 위에 뜨는 작은 메뉴(찜 범위 ▾, 보기 옵션)와 검색 입력창. 바깥을 누르면 메뉴가 닫힌다.
  const [menu, setMenu] = useState<"options" | null>(null);
  // 모바일: 사진을 내려 볼 때 헤더·보기 도구를 접어 사진 칸을 넓힌다(위로 올리면 다시 보인다). PC는 CSS에서 무시.
  const [chromeHidden, setChromeHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!toolsRef.current?.contains(event.target as Node)) setMenu(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  // 배지(⧉ N)로 펼친 유사컷 묶음. 장면을 바꾸거나 묶기를 다시 켜면 접는다.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  // 공통 헤더(레이아웃): 고르기 단계 강조, 화면 높이 잠금, 초대 인트로·접근 종료 화면에서는 감춘다. 참여자가 보는 사진은 헤더 아바타로 연다.
  useProjectShell({
    step: "select",
    viewportLocked: true,
    // 채워지기 전에는 숨기지 않는다 — 소유자도 isOwner가 아직 false라 헤더가 사라졌다 다시 생긴다.
    hidden: hydrated && (accessDenied || (!isOwner && (!participantReady || (searchParams.get("invite") === "1" && !inviteSeen)))),
    onOpenParticipantPhoto: setOpenPhotoId,
  });
  const [sceneNotice, setSceneNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!sceneNotice) return;
    const timer = window.setTimeout(() => setSceneNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [sceneNotice]);
  const [sheet, setSheet] = useState<"scenes" | "ai" | null>(null);
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

  const analysis = useSceneAnalysis(projectId, project.photos, project.shootType, project.aiScenes, store.refresh);
  const photos = analysis.photos;
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const scenes = analysis.scenes;
  // 촬영 시간순 전체 목록 — 장면이 없을 때와 AI 정리 중(1차 훑어보기)에 쓴다.
  const timeOrdered = useMemo(() => [...photos].sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.orderIndex - b.orderIndex), [photos]);
  // 정리 중에 들어온 사람은 끝나도 보던 전체 보기를 유지하고, 장면별 보기는 제안만 한다.
  const [holdAll, setHoldAll] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [newPhotosDismissed, setNewPhotosDismissed] = useState(false);
  if (analysis.status === "analyzing" && !holdAll) setHoldAll(true);
  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const likesOf = useCallback((photoId: string) => project.photoStates[photoId]?.color ?? [], [project.photoStates]);
  const myLikes = useMemo(() => new Set(photos.filter((photo) => likesOf(photo.id).includes(me)).map((photo) => photo.id)), [likesOf, me, photos]);
  // 역할별 "고른 사진": 소유자는 최종 선택, 참여자는 내 찜.
  const picked = isOwner ? selectedIds : myLikes;
  const people = useMemo(() => activeParticipants(project), [project]);
  const targets = useMemo(() => scenes ? sceneTargets(scenes.map((scene) => scene.photoIds.length), project.target) : [], [project.target, scenes]);
  const pickedInScene = useCallback((target: NamedScene) => target.photoIds.filter((id) => picked.has(id)).length, [picked]);

  // 장면이 있으면 한 번에 한 장면, 정리 전·정리 중이면 촬영 시간순 한 목록.
  const sceneMode = Boolean(scenes) && !holdAll;
  const resumeScene = scenes ? Math.max(0, scenes.findIndex((item, index) => pickedInScene(item) < (isOwner ? targets[index] : 1))) : 0;
  const sceneIndex = sceneMode ? Math.min(Math.max(chosenScene ?? resumeScene, 0), scenes!.length - 1) : null;
  const scene = sceneIndex === null ? null : scenes![sceneIndex];
  const peopleFilter = peoplePick?.scene === sceneIndex ? peoplePick.kind : null;
  const setPeopleFilter = (kind: PeopleKind | null) => setPeoplePick(kind ? { scene: sceneIndex, kind } : null);
  const nextScene = scenes && sceneIndex !== null && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null;
  const prevScene = scenes && sceneIndex !== null && sceneIndex > 0 ? scenes[sceneIndex - 1] : null;

  const scenePhotos = useMemo(
    () => scene ? scene.photoIds.flatMap((id) => photoById.get(id) ?? []) : timeOrdered,
    [photoById, scene, timeOrdered],
  );
  const filterPhotos = useCallback((candidates: Photo[], person: PeopleKind | null) => {
    const text = query.trim().toLowerCase();
    return candidates.filter((photo) => {
      if (scope === "picked" && !selectedIds.has(photo.id)) return false;
      if (scope === "liked" && !likesOf(photo.id).length) return false;
      // 빼고 보기: 의심 사진은 갤러리에서 뺀다. 이미 고른(참여자는 찜한) 사진은 절대 빼지 않는다.
      if (setAside && isBlurFlagged(photo) && !picked.has(photo.id)) return false;
      if (person && photo.people !== person) return false;
      return !text || getPhotoDisplayName(photo).toLowerCase().includes(text);
    });
  }, [likesOf, picked, query, scope, selectedIds, setAside]);
  // 찜 보기는 찜한 사람이 많은 사진부터(같으면 촬영 순서 그대로 — 안정 정렬). 따로 "2명 이상" 같은 범위를 두지 않는다.
  const filtered = useMemo(() => {
    const result = filterPhotos(scenePhotos, peopleFilter);
    return scope === "liked" ? result.sort((a, b) => likesOf(b.id).length - likesOf(a.id).length) : result;
  }, [filterPhotos, likesOf, peopleFilter, scenePhotos, scope]);
  const setAsideCount = useMemo(
    () => (setAside ? scenePhotos.filter((photo) => isBlurFlagged(photo) && !picked.has(photo.id)).length : 0),
    [picked, scenePhotos, setAside],
  );

  const groupsInView = useMemo(() => {
    const groups = new Map<string, Photo[]>();
    filtered.forEach((photo) => {
      if (photo.similarityGroupId) groups.set(photo.similarityGroupId, [...(groups.get(photo.similarityGroupId) ?? []), photo]);
    });
    // 묶음 안에서는 흔들림·눈 감음 의심 사진을 맨 뒤로(표지·상세 ↑↓·띠가 멀쩡한 컷부터).
    groups.forEach((members, groupId) => groups.set(groupId, [...members.filter((photo) => !isFlagged(photo)), ...members.filter(isFlagged)]));
    return groups;
  }, [filtered]);
  const hasGroups = Array.from(groupsInView.values()).some((members) => members.length > 1);
  // 묶음은 갤러리에서 묶음이 처음 나오는 자리에 모은다 — 접혔으면 표지 한 장(고른 사진, 없으면 의심 사진을 뒤로 보낸 첫 사진),
  // 펼쳤으면 묶음 사진 전부를 나란히.
  // (유사컷은 촬영 시각이 연달아 있다는 보장이 없어 시간순 그대로 두면 펼친 묶음 사이에 다른 사진이 끼어든다.)
  const visible = useMemo(() => {
    if (!grouped || !hasGroups) return filtered;
    const placed = new Set<string>();
    const result: Photo[] = [];
    for (const photo of filtered) {
      const groupId = photo.similarityGroupId;
      const members = groupId ? groupsInView.get(groupId) ?? [] : [];
      if (!groupId || members.length < 2) { result.push(photo); continue; }
      if (placed.has(groupId)) continue;
      placed.add(groupId);
      if (expanded.has(groupId)) result.push(...members);
      else result.push(members.find((member) => picked.has(member.id)) ?? members[0]);
    }
    return result;
  }, [expanded, filtered, grouped, groupsInView, hasGroups, picked]);
  // 펼친 묶음 사진이면 그 묶음 키 — 갤러리가 묶음을 새 줄에 나란히 놓고 띠로 감싼다.
  const bandOf = useCallback((photo: Photo) => {
    const groupId = photo.similarityGroupId;
    return grouped && hasGroups && groupId && expanded.has(groupId) && (groupsInView.get(groupId)?.length ?? 0) > 1 ? groupId : null;
  }, [expanded, grouped, groupsInView, hasGroups]);
  // 묶기가 켜져 있으면 표지 한 칸에 든 사진들(상세에서 ↑↓·띠로 본다). 아니면 빈 목록.
  const membersOf = useCallback((photo: Photo) => {
    if (!grouped || !hasGroups || !photo.similarityGroupId || expanded.has(photo.similarityGroupId)) return [];
    const members = groupsInView.get(photo.similarityGroupId) ?? [];
    return members.length > 1 ? members : [];
  }, [expanded, grouped, groupsInView, hasGroups]);

  const similarOf = useCallback((photo: Photo) => photo.similarityGroupId ? photos.filter((member) => member.similarityGroupId === photo.similarityGroupId) : [], [photos]);

  async function startTidy(kinds: AiTidyKind[]) {
    setAiPending(true);
    setAiError(null);
    const error = await analysis.start(kinds);
    setAiPending(false);
    if (!error && kinds.includes("quality")) setSetAside(true);
    if (error) setAiError(error);
    else setSheet(null);
  }

  /** 다른 장면으로 이동. 당겨서 넘어온 장면은 처음부터, 퀵메뉴로 고른 장면은 마지막으로 보던 곳부터 본다. */
  function goScene(index: number, byPull: "next" | "prev" | null = null, keepView = false) {
    if (!keepView) { setScope("all"); setQuery(""); }
    setPeoplePick(keepView && peopleFilter ? { scene: index, kind: peopleFilter } : null);
    setExpanded(new Set());
    setHoldAll(false);
    setSheet(null);
    // 접힌 헤더·보기 도구는 새 장면에서 다시 펼친다 — 장면 맨 위에서는 스크롤 신호가 없어 접힌 채 남는다.
    setChromeHidden(false);
    setChosenScene(index);
    setEnteredBy(byPull);
    // 지금 보는 장면을 주소와 이 탭에 남겨 새로고침·재진입 때 같은 장면으로 돌아온다.
    window.history.replaceState(window.history.state, "", `?scene=${index}`);
    try { sessionStorage.setItem(lastSceneKey, String(index)); } catch {}
  }

  // AI 장면은 이름이 제목, 시간대는 보조 정보. 이름이 없으면(시간 장면) 시간대가 제목이다.
  const sceneTitle = (item: NamedScene) => item.name ?? (scenes && scenes.length > 1 ? formatSceneRange(item) : "전체 사진");

  // 상세의 끝에서는 같은 보기 조건에 맞는 사진이 있는 다음/이전 장면으로 이어간다.
  const detailInScene = Boolean(openPhotoId && filtered.some((photo) => photo.id === openPhotoId));
  const boundary = (step: 1 | -1) => {
    if (!sceneMode || !scenes || sceneIndex === null || !detailInScene) return null;
    for (let index = sceneIndex + step; index >= 0 && index < scenes.length; index += step) {
      const matches = filterPhotos(scenes[index].photoIds.flatMap((id) => photoById.get(id) ?? []), peopleFilter);
      const photo = step === 1 ? matches[0] : matches.at(-1);
      if (photo) return { index, photoId: photo.id, label: sceneTitle(scenes[index]) };
    }
    return null;
  };
  const nextDetailScene = boundary(1);
  const prevDetailScene = boundary(-1);
  const passDetailScene = (target: NonNullable<typeof nextDetailScene>) => {
    goScene(target.index, null, true);
    setOpenPhotoId(target.photoId);
    setSceneNotice(`${target.index > sceneIndex! ? "다음" : "이전"} 장면 · ${target.label}`);
  };

  // 상세에서 보고 있는 사진을 함께 고르는 사람에게 알린다.
  const { setViewingPhoto } = store;
  useEffect(() => {
    if (!participantReady) return;
    const timer = window.setTimeout(() => setViewingPhoto(openPhotoId), 250);
    return () => window.clearTimeout(timer);
  }, [openPhotoId, participantReady, setViewingPhoto]);
  useEffect(() => () => setViewingPhoto(null), [setViewingPhoto]);

  if (!hydrated) return <ProjectBodySkeleton variant="gallery" label="사진을 불러오고 있어요" />;
  if (accessDenied) return <ParticipantAccessEndedScreen />;
  if (!isOwner && (!participantReady || (searchParams.get("invite") === "1" && !inviteSeen))) return <ParticipantJoinScreen onEnter={enterFromInvite} />;

  const target = project.target;
  const pickedTotal = picked.size;
  const hasQuality = scenePhotos.some(isBlurFlagged);
  // 인물 구성 칩: 지금 장면에 판정된 사진이 있을 때만, 장수가 있는 구성만 보인다.
  const peopleCounts = PEOPLE_KINDS.map((kind) => ({ kind, count: scenePhotos.filter((photo) => photo.people === kind).length })).filter((item) => item.count > 0);
  // 켜고 끄는 토글(다시 누르면 풀림) — "모두" 칩은 두지 않는다(보기 범위의 "전체"와 겹쳐 헷갈림).
  const peopleChips = peopleCounts.length > 1 ? peopleCounts.map(({ kind }) => (
    <button key={kind} type="button" aria-pressed={peopleFilter === kind} onClick={() => setPeopleFilter(peopleFilter === kind ? null : kind)}>
      {peopleLabel(kind, project.shootType)}
    </button>
  )) : null;
  const myDone = Boolean(project.participantDone[me]);
  const toReview = () => router.push(`/customer-select/${projectId}/review`);
  // 일시 대화는 당분간 숨긴다(2026-10-02) — 다시 켜려면 CHAT_ENABLED만 true로.
  const withChat = CHAT_ENABLED && people.length > 1;

  // 장면별 진행은 계산하게 하지 않고 한 일만 말로: `4장 골랐어요`(분수·추천 장수 없음). 참여자는 내 찜 수만.
  const sceneCount = (index: number) => {
    const count = pickedInScene(scenes![index]);
    if (!count) return "";
    return isOwner ? `${count}장 골랐어요` : `찜 ${count}장`;
  };
  const sceneDone = (index: number) => isOwner && targets[index] > 0 && pickedInScene(scenes![index]) >= targets[index];

  // 장면 정리 진행 막대는 이름 붙인 장면 수 기준(유사컷·흔들림은 따로 줄로 보이고 장면을 기다리게 하지 않는다).
  const sceneTask = analysis.tasks.find((task) => task.kind === "scene" && task.status === "processing");
  const analysisPercent = sceneTask?.total ? Math.min(100, Math.round((sceneTask.done / sceneTask.total) * 100)) : 0;
  // 장면이 먼저 끝나도 유사컷·흔들림은 뒤에서 계속 돈다 — 끝난 것처럼 보이지 않게 배너로 진행을 보여준다.
  const backgroundTasks = analysis.status === "analyzing" ? [] : analysis.tasks.filter((task) => task.status === "processing" && task.kind !== "scene");
  const backgroundTotal = backgroundTasks.reduce((sum, task) => sum + task.total, 0);
  const backgroundPercent = backgroundTotal ? Math.min(100, Math.round((backgroundTasks.reduce((sum, task) => sum + task.done, 0) / backgroundTotal) * 100)) : 0;
  const backgroundLines = backgroundTasks.map((task) => <span key={task.kind}>{taskProgressText(task)}</span>);
  const analysisBanner = analysis.status === "analyzing" ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>AI가 장면을 나누고 있어요</strong>
        {analysis.tasks.filter((task) => task.status === "processing").map((task) => <span key={task.kind}>{taskProgressText(task)}</span>)}
        <span>그동안 마음에 드는 사진에 ♡를 눌러 두세요. 정리가 끝나면 장면별로 모아서 보여드릴게요.</span>
        <i aria-hidden><b style={{ width: `${analysisPercent}%` }} /></i>
      </div>
    </div>
  ) : analysis.status === "ready" && holdAll && !promptDismissed && scenes ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>장면 정리가 끝났어요 · {scenes.length}개 장면</strong>
        <span>{myLikes.size ? `찜한 ${myLikes.size}장도 장면별로 나눠뒀어요.` : "장면별로 나눠서 보면 고르기 쉬워요."}</span>
        {backgroundLines}
      </div>
      <div className={s.analysisActions}>
        <PhotographerLightButton size="toolbar" onClick={() => goScene(resumeScene)}>장면별로 보기</PhotographerLightButton>
        <PhotographerLightButton variant="outline" size="toolbar" onClick={() => setPromptDismissed(true)}>계속 보기</PhotographerLightButton>
      </div>
    </div>
  ) : null;
  const backgroundBanner = !analysisBanner && backgroundTasks.length ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>AI가 사진을 더 정리하고 있어요</strong>
        {backgroundLines}
        <span>끝나면 이 화면에 바로 반영돼요.</span>
        <i aria-hidden><b style={{ width: `${backgroundPercent}%` }} /></i>
      </div>
    </div>
  ) : null;
  const tidied = analysis.status === "ready" || analysis.status === "fallback";
  // 정리 뒤에 사진이 더 올라오면 다시 정리를 권한다(보기 옵션 안에만 두면 찾기 어려워서).
  const newPhotosBanner = !analysisBanner && !backgroundBanner && isOwner && tidied && analysis.newPhotoCount && !newPhotosDismissed ? (
    <div className={s.analysis} role="status">
      <Sparkles size={16} aria-hidden />
      <div>
        <strong>새 사진 {analysis.newPhotoCount}장이 추가됐어요</strong>
        <span>AI로 다시 정리하면 새 사진도 장면·유사컷에 들어가요. 고른 사진·찜·메모는 그대로예요.</span>
      </div>
      <div className={s.analysisActions}>
        <PhotographerLightButton size="toolbar" onClick={() => { setAiError(null); setSheet("ai"); }}>AI로 다시 정리</PhotographerLightButton>
        <PhotographerLightButton variant="outline" size="toolbar" onClick={() => setNewPhotosDismissed(true)}>나중에</PhotographerLightButton>
      </div>
    </div>
  ) : null;

  // 장면 정리 실패, 유사컷·흔들림 실패·일부 실패(다시 시도), 뒤에서 진행 중인 작업을 한 줄로.
  const failedNotice = analysis.notice && isOwner
    ? analysis.notice.retry
      ? <button type="button" className={s.quickNotice} onClick={() => setSheet("ai")}>{analysis.notice.text}</button>
      : <span className={s.quickNotice} role="status">{analysis.notice.text}</span>
    : null;
  const sceneItems = scenes?.map((item, index) => (
    <button key={index} type="button" className={s.quickItem} aria-current={index === sceneIndex} onClick={() => goScene(index)}>
      <span>{sceneTitle(item)}</span>
      {isOwner
        ? <em className={s.sceneProgress}><b className={sceneDone(index) ? s.done : ""}>{sceneCount(index)}</b></em>
        : <em>{sceneCount(index)}</em>}
    </button>
  ));

  const card = (photo: Photo, columns: number) => {
    const groupId = photo.similarityGroupId ?? undefined;
    const members = groupId ? groupsInView.get(groupId) ?? [] : [];
    const inGroup = grouped && hasGroups && members.length > 1;
    const isOpen = inGroup && expanded.has(groupId!);
    const isCover = inGroup && !isOpen;
    return (
      <GalleryPhotoCard
        key={photo.id}
        token={projectId}
        href="#"
        photo={photo}
        // ✓(왼쪽 위)는 최종 선택 — 소유자는 누르고, 참여자는 소유자가 고른 사진에 표시만 본다.
        // 접힌 묶음도 표지(앞에 보이는 대표 사진)를 바로 최종 선택할 수 있다 — 표지의 ✓는 표지 사진 한 장.
        // 묶음 안에 고른 사진이 있으면 ✓ 자리에 묶음 선택 수 `✓ M`을 덮어 보이고(누르면 아래 ✓가 눌린다), 표지는 고른 사진이 앞에 온다.
        selected={selectedIds.has(photo.id)}
        showCheck={!(columns >= 3 && typeof window !== "undefined" && window.innerWidth <= 767)}
        checkReadOnly={!isOwner}
        showRating={false}
        // 찜(왼쪽 아래 `♥ N`): 누구에게나 같은 자리·모양. 접힌 묶음도 ✓처럼 표지(대표 사진) 한 장의 찜이다.
        liked={myLikes.has(photo.id)}
        likeCount={likesOf(photo.id).length}
        likeNames={likesOf(photo.id).map((color) => color === me ? "나" : project.participantNicknames[color] || "참가자").join(", ")}
        likePrimary={!isOwner}
        hasComment={Boolean(project.photoStates[photo.id]?.comment)}
        showGroupBadge={isCover}
        groupId={groupId}
        restCount={Math.max(0, members.length - 1)}
        totalCount={members.length}
        selectedCount={members.filter((member) => selectedIds.has(member.id)).length}
        // 펼친 묶음은 첫 장에만 "⧉ 접기" 배지를 둔다.
        isGroupExpanded={isOpen && members[0]?.id === photo.id}
        inExpandedGroup={isOpen}
        compactGroupBadge
        onGroupBadgeClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(groupId!)) next.delete(groupId!); else next.add(groupId!);
            return next;
          });
        }}
        presignedThumb={photo.url}
        thumbQueue={thumbQueue}
        viewerQueryString=""
        density={columns}
        showFilename={query.trim().length > 0}
        onPhotoClick={(event) => { event.preventDefault(); setOpenPhotoId(photo.id); }}
        onCheckClick={(event) => {
          event.preventDefault(); event.stopPropagation();
          // 고를 때만 아주 짧은 진동(지원하는 기기만 — iOS Safari는 무시).
          if (!selectedIds.has(photo.id)) navigator.vibrate?.(10);
          store.toggleSelect(photo.id);
        }}
        onLikeClick={(event) => { event.preventDefault(); event.stopPropagation(); store.toggleLike(photo.id, me); }}
        popOnSelect={isOwner}
        onRate={() => {}}
        onThumbError={() => {}}
      />
    );
  };

  const optionCount = (hasGroups && grouped ? 1 : 0) + (hasQuality && setAside ? 1 : 0);

  // 장면 끝의 얇은 안내: 다음 장면 이름(당기면 넘어간다는 신호), 마지막 장면이면 끝이라는 것만 — 진행·버튼은 하단 바에 이미 있다.
  const sceneFooter = scene ? (nextScene
    ? <p className={s.sceneNext}><ArrowDown size={14} aria-hidden /><span>다음</span><strong>{sceneTitle(nextScene)}</strong></p>
    : <p className={s.sceneNext}><span>마지막 장면이에요</span></p>) : undefined;

  // 진행은 분수 대신 문장으로 — 이미 한 일(크게)과 앞으로 할 일(작게).
  const doneText = pickedTotal ? `지금까지 ${pickedTotal}장 골랐어요` : "아직 고른 사진이 없어요";
  const guideText = target ? `${target}장 정도 골라주세요` : "마음에 드는 사진을 골라주세요";
  // 모바일 하단 바 왼쪽: 지금 장면(누르면 장면 목록 시트)과 대화 — 떠 있던 장면 버튼을 하단 바 한 줄로 합쳤다. PC는 사이드바가 맡는다.
  const sceneDock = sceneMode && scenes ? <>
    <button type="button" className={s.barScene} onClick={() => setSheet("scenes")} aria-label="장면 목록 열기">
      <strong><i aria-hidden />{sceneTitle(scene!)}<ChevronUp size={14} aria-hidden /></strong>
      <span>{isOwner ? (pickedInScene(scene!) ? `이 장면에서 ${pickedInScene(scene!)}장 골랐어요` : "") : <>이 장면 ♥{pickedInScene(scene!)} · 내 찜 {myLikes.size}장</>}</span>
    </button>
    {withChat && <button type="button" className={s.barChat} aria-label={chatOpen ? "대화 닫기" : "대화 열기"} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)}><MessageCircle size={18} /></button>}
  </> : null;
  // 끝내기 버튼은 하나 — 장면이 남았고 약속 장수도 못 채웠으면 연한 주황(눌리지만 재촉하지 않음), 마지막 장면이거나 장수를 채우면 진한 주황.
  const finishSoft = Boolean(nextScene) && !(target && pickedTotal >= target);
  const bottomBar = !isOwner ? <>
    {sceneDock}
    <div className={`${s.barMeta} ${sceneDock ? s.barMetaWithDock : ""}`}><strong>내가 찜한 사진 {myLikes.size}장</strong><span>최종 선택은 {project.participantNicknames.red || "소유자"}님이 해요</span></div>
    <div className={s.barActions}>
      <PhotographerLightButton variant={myDone ? "outline" : "primary"} size="work-panel" className={!myDone && nextScene ? s.finishSoft : ""} onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>
    </div>
  </> : <>
    {sceneDock}
    <div className={`${s.barMeta} ${sceneDock ? s.barMetaWithDock : ""}`}>
      <strong>{doneText}</strong>
      <span>{guideText}{scene && <span className={s.desktopOnlyInline}> · {sceneTitle(scene)}{pickedInScene(scene) ? `에서 ${pickedInScene(scene)}장 골랐어요` : ""}</span>}</span>
    </div>
    <div className={s.barActions}>
      <PhotographerLightButton size="work-panel" className={finishSoft ? s.finishSoft : ""} disabled={!pickedTotal} onClick={toReview}>선택 결과 확인하기 →</PhotographerLightButton>
    </div>
  </>;

  return (
    <>
      <div className={s.page} data-chat={withChat ? "" : undefined} data-chrome-hidden={chromeHidden && !menu ? "" : undefined}>

        {syncStatus === "offline" && <div role="status" className="border-b border-danger/20 bg-danger/8 px-5 py-2 text-center text-xs font-semibold text-danger">연결이 불안정해요. 다시 연결하고 있어요.</div>}
        {/* 저장하지 못한 메모는 상세를 닫아도 여기 남고, 다시 저장할 수 있다(글은 버리지 않는다). */}
        {failedMemoCount > 0 && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-5 py-2 text-xs font-semibold text-danger"><span className="flex-1">메모 {failedMemoCount}개를 저장하지 못했어요. 쓴 내용은 남아 있어요.</span><button type="button" className="underline" onClick={retryFailedComments}>다시 저장</button></div>}
        {saveError && failedMemoCount === 0 && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger/8 px-5 py-2 text-xs font-semibold text-danger"><span className="flex-1">{saveError}</span><button type="button" onClick={clearSaveError}>닫기</button></div>}

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
              {/* 전체 진행은 하단 바 문장이 맡는다(여기 `2 / 9장` 분수는 뺐다). */}
              {withChat && (
                <div className={s.railFooter}>
                  <button type="button" className={s.quickChat} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)}><MessageCircle size={15} />대화</button>
                </div>
              )}
            </nav>
          )}
          <div className={`${s.main} ${sceneMode ? s.mainWithQuick : ""} ${sceneMode && railCollapsed ? s.mainFloatNav : ""}`}>
            {analysisBanner}
            {backgroundBanner}
            {newPhotosBanner}
            {!sceneMode && !analysisBanner && (
              <div className={s.sceneHeader}>
                <strong className={s.allTitle}>전체 사진 <small>촬영 시간순 · {photos.length.toLocaleString()}장</small></strong>
                {scenes
                  ? <button type="button" className={s.textLink} onClick={() => goScene(resumeScene)}>장면별로 보기</button>
                  : analysis.status === "none" && isOwner && photos.length > 0 && <button type="button" className={s.aiButton} onClick={() => { setAiError(null); setSheet("ai"); }}><Sparkles size={14} />AI로 장면 정리</button>}
              </div>
            )}
            <div className={s.toolsWrap} ref={toolsRef}>
              <div className={s.toolsAnchor}>
              <div className={s.tools} style={sceneMode || analysisBanner || backgroundBanner || newPhotosBanner ? { paddingTop: 10 } : undefined}>
                {/* 보기 범위·인물 칩에는 장수를 붙이지 않는다 — 숫자를 해석하게 만들어서(2026-10-02). */}
                <div className={s.segments} role="group" aria-label="보기 범위">
                  <button type="button" aria-pressed={scope === "all"} aria-label="모두" onClick={() => setScope("all")}>모두</button>
                  <button type="button" aria-pressed={scope === "liked"} aria-label="♥ 찜한 사진" onClick={() => setScope("liked")}>♥ 찜</button>
                  <button type="button" aria-pressed={scope === "picked"} aria-label="✓ 최종 선택" onClick={() => setScope("picked")}>✓ 최종 선택</button>
                </div>
                {/* 인물 칩: PC는 툴바 줄 안, 모바일은 툴바 아래 가로 스크롤 줄(스크롤하면 툴바와 함께 접힌다). */}
                {peopleChips && <div className={`${s.peopleChips} ${s.peopleChipsInline}`} role="group" aria-label="인물 구성"><span className={s.peopleLabel} aria-hidden><Users size={13} />인물</span>{peopleChips}</div>}
                <span className={s.toolsSpacer} />
                {searchOpen || query
                  ? <input className={`${s.search} ${s.desktopOnly}`} type="search" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} onBlur={() => { if (!query) setSearchOpen(false); }} placeholder="파일명 검색" aria-label="파일명 검색" />
                  : <button type="button" className={`${s.iconTool} ${s.desktopOnly}`} aria-label="파일명 검색 열기" title="파일명 검색" onClick={() => setSearchOpen(true)}><Search size={16} /></button>}
                {/* 모바일은 파일명 검색 대신 보기 크기(크게 2열·중간 3열·작게 4열). */}
                <button type="button" className={`${s.iconTool} ${s.mobileOnly}`} aria-label={`보기 크기: ${sizeLabel[mobileColumns]} (누르면 ${sizeLabel[nextColumns[mobileColumns]]})`} title="보기 크기" onClick={() => setMobileColumns(nextColumns[mobileColumns])}>
                  {mobileColumns === 2 ? <Grid2x2 size={16} /> : mobileColumns === 3 ? <Grid3x3 size={16} /> : <Grip size={16} />}
                </button>
                <button type="button" className={s.iconTool} aria-label="보기 옵션" title="보기 옵션" aria-haspopup="dialog" aria-expanded={menu === "options"} onClick={() => setMenu(menu === "options" ? null : "options")}>
                  <SlidersHorizontal size={16} />{optionCount > 0 && <i>{optionCount}</i>}
                </button>
              </div>
              {menu === "options" && (
                <div className={s.toolsMenu} role="dialog" aria-label="보기 옵션">
                  {hasGroups && (
                    <button type="button" role="switch" aria-checked={grouped} className={s.switchRow} onClick={() => { rememberGroupSimilar(projectId, !grouped); setGrouped(!grouped); setExpanded(new Set()); }}>
                      <span><strong>유사컷 묶기</strong><small>비슷한 사진을 한 장으로 접어 보여요</small></span><i aria-hidden />
                    </button>
                  )}
                  {hasQuality && (
                    <button type="button" role="switch" aria-checked={setAside} className={s.switchRow} onClick={() => toggleSetAside(!setAside)}>
                      <span><strong>흔들림 사진 빼기</strong><small>AI가 흔들림·초점 문제를 의심한 사진을 빼요(고른 사진은 남겨요)</small></span><i aria-hidden />
                    </button>
                  )}
                  {!hasGroups && !hasQuality && <p className={s.toolsMenuEmpty}>AI로 정리하면 유사컷 묶기·흔들림 빼기를 쓸 수 있어요</p>}
                  {isOwner && tidied && (
                    <button type="button" className={s.retidyRow} onClick={() => { setMenu(null); setAiError(null); setSheet("ai"); }}>
                      <span><strong>AI 다시 정리</strong><small>{analysis.newPhotoCount ? `새로 올린 ${analysis.newPhotoCount}장까지 장면·유사컷을 다시 나눠요` : "장면·유사컷을 다시 나눠요. 고른 사진·찜·메모는 그대로예요"}</small></span>
                      <Sparkles size={15} aria-hidden />
                    </button>
                  )}
                </div>
              )}
              </div>
              {setAside && setAsideCount > 0 && (
                <p className={s.toolsNote}>
                  <span>흔들림 <strong>{setAsideCount}장</strong> 빼고 보는 중</span>
                  <button type="button" onClick={() => toggleSetAside(false)}>끄기</button>
                </p>
              )}
            </div>
            <SceneGrid
              key={sceneMode ? `scene-${sceneIndex}` : "all"}
              photos={visible}
              mobileColumns={mobileColumns}
              positionKey={`ps:self-select:${projectId}:${sceneMode ? `s${sceneIndex}` : "all"}:${scope}:${peopleFilter ?? ""}:${grouped ? 1 : 0}`}
              startAt={enteredBy === "next" ? "top" : enteredBy === "prev" ? "bottom" : null}
              enterFrom={enteredBy === "next" ? "below" : enteredBy === "prev" ? "above" : null}
              renderCard={card}
              bandOf={bandOf}
              empty={<><strong>조건에 맞는 사진이 없어요</strong><span>보기 조건을 바꿔보세요.</span><button type="button" onClick={() => { setScope("all"); setQuery(""); }}>모두 보기</button></>}
              footer={sceneFooter}
              next={nextScene ? { label: sceneTitle(nextScene), onPass: () => goScene(sceneIndex! + 1, "next") } : null}
              prev={prevScene ? { label: sceneTitle(prevScene), onPass: () => goScene(sceneIndex! - 1, "prev") } : null}
              focus={focus}
              onScrollDirection={setChromeHidden}
            />

            {/* 퀵메뉴: 장면 목차(지금 장면·장면별 고른 수)와 대화. PC는 사이드바·접은 점 메뉴, 모바일은 하단 바의 장면 버튼 → 장면 시트. */}
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
              </>
            )}
            <div className={s.bottomBar} data-locked-bar data-stacked={isOwner && sceneMode && scenes ? "" : undefined}>{bottomBar}</div>
          </div>
        </div>
      </div>

      {sheet === "scenes" && scenes && <Sheet title="장면" onClose={() => setSheet(null)}><div className={s.sheetList}>{sceneItems}</div>{failedNotice}</Sheet>}
      {sheet === "ai" && <AiTidySheet projectId={projectId} photoCount={photos.length} rerun={tidied} pending={aiPending} error={aiError} onStart={(kinds) => void startTidy(kinds)} onClose={() => setSheet(null)} />}

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
          photos={detailInScene ? visible : photos}
          membersOf={detailInScene ? membersOf : undefined}
          photoId={openPhotoId}
          onPhotoChange={setOpenPhotoId}
          nextScene={nextDetailScene && { label: nextDetailScene.label, onGo: () => passDetailScene(nextDetailScene) }}
          prevScene={prevDetailScene && { label: prevDetailScene.label, onGo: () => passDetailScene(prevDetailScene) }}
          sceneNotice={sceneNotice}
          onClose={() => {
            // 마지막으로 본 사진이 접힌 유사컷 안에 있으면 그 묶음의 표지 위치로 돌아간다.
            const last = photoById.get(openPhotoId);
            const target = visible.some((photo) => photo.id === openPhotoId) ? openPhotoId
              : visible.find((photo) => last?.similarityGroupId && photo.similarityGroupId === last.similarityGroupId)?.id;
            if (target) setFocus({ photoId: target, nonce: Date.now() });
            setOpenPhotoId(null);
            setSceneNotice(null);
          }}
          isOwner={isOwner}
          myColor={me}
          people={people}
          selectedIds={selectedIds}
          likesOf={likesOf}
          commentOf={(photoId) => failedComments[photoId] ?? project.photoStates[photoId]?.comment ?? ""}
          similarOf={similarOf}
          commentSaveStates={store.commentSaveStates}
          onToggleSelect={store.toggleSelect}
          onToggleLike={(photoId) => store.toggleLike(photoId, me)}
          onSaveComment={store.setComment}
        />
      )}
    </>
  );
}
