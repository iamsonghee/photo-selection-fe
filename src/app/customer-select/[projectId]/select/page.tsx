"use client";

/**
 * 셀프 고객 셀렉 ② 고르기.
 * 촬영 시각(이후 AI)으로 나눈 "장면"이 화면의 뼈대다 — 2,000장을 장면 몇 개의 작은 일로 쪼갠다.
 * 한 번에 한 장면을 보고, 장면 끝에서 쭉 당기면 다음 장면으로 넘어간다. 장면 이동은 퀵메뉴가 맡는다.
 * 역할마다 메인 동작은 하나다: 소유자는 ✓ 최종 선택, 참여자는 ♡ 찜.
 * 격자는 고르는 곳, 상세는 고민하는 곳. 유사컷 묶음 표지는 바로 고르지 않고 펼쳐서 비교한다.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ChevronDown, ChevronUp, MessageCircle, Grid2x2, Grid3x3, Grip, PanelLeftClose, PanelLeftOpen, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { formatSceneRange, sceneTargets } from "@/lib/customer-scenes";
import type { PeopleKind, Photo } from "@/types";
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
import { taskProgressText, useSceneAnalysis, type NamedScene } from "./useSceneAnalysis";
import { AiTidySheet, groupSimilarKey, rememberGroupSimilar, setAsideKey, type AiTidyKind } from "./AiTidySheet";
import s from "./select.module.css";

type Scope = "all" | "picked" | "liked" | "mine" | "popular";
const LIKE_SCOPES: readonly Scope[] = ["liked", "mine", "popular"];
// 인물 구성(AI 판정) 칩 순서·이름. 돌잔치는 단독 컷이 대부분 아기라 이름을 바꿔 보인다.
const PEOPLE_KINDS: readonly PeopleKind[] = ["solo", "family", "group", "none"];
const peopleLabel = (kind: PeopleKind, shootType: string | null) =>
  ({ solo: shootType === "first_birthday" ? "아기 단독" : "단독", family: "가족·소수", group: "여러 명", none: "사람 없음" })[kind];

/** AI가 흔들림(흐림) 또는 눈 감음을 의심한 사진 — 유사컷 묶음 안에서 맨 뒤로 보낸다(비슷한 컷 중 멀쩡한 것부터). */
const isFlagged = (photo: Photo) => Boolean(photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
/** 갤러리에서 빼는 건 흔들림(흐림)만 — 눈 감음은 웃음·윙크 같은 의도된 표정이 많아 숨기지 않는다. */
const isBlurFlagged = (photo: Photo) => photo.isBlurry === true;

const sizeLabel: Record<MobileColumns, string> = { 2: "크게", 3: "중간", 4: "작게" };

export default function CustomerSelectPage() {
  return <Suspense fallback={<SystemLoadingScreen title="사진을 불러오고 있어요" homeHref="/customer-select" />}><SelectScreen /></Suspense>;
}

function SelectScreen() {
  const projectId = useParams().projectId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useCustomerSelectStore();
  const { project, hydrated, isOwner, currentIdentity: me, participantReady, accessDenied, syncStatus, saveError, clearSaveError } = store;
  // 초대 링크(`?invite=1`, 미들웨어가 붙임)로 들어오면 참여한 적이 있어도 초대 화면을 먼저 보여준다(작가 고객 초대와 같은 흐름).
  const [inviteSeen, setInviteSeen] = useState(false);
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
  const [menu, setMenu] = useState<"like" | "options" | "size" | null>(null);
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

  const analysis = useSceneAnalysis(projectId, project.photos, project.shootType, project.aiScenes, store.refresh);
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
  const peopleFilter = peoplePick?.scene === sceneIndex ? peoplePick.kind : null;
  const setPeopleFilter = (kind: PeopleKind | null) => setPeoplePick(kind ? { scene: sceneIndex, kind } : null);
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
      if (scope === "liked" && !likesOf(photo.id).length) return false;
      if (scope === "mine" && !myLikes.has(photo.id)) return false;
      if (scope === "popular" && likesOf(photo.id).length < 2) return false;
      // 빼고 보기: 의심 사진은 갤러리에서 뺀다. 이미 고른(참여자는 찜한) 사진은 절대 빼지 않는다.
      if (setAside && isBlurFlagged(photo) && !picked.has(photo.id)) return false;
      if (peopleFilter && photo.people !== peopleFilter) return false;
      return !text || getPhotoDisplayName(photo).toLowerCase().includes(text);
    });
  }, [likesOf, myLikes, peopleFilter, picked, query, scenePhotos, scope, selectedIds, setAside]);
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
  function goScene(index: number, byPull: "next" | "prev" | null = null) {
    setScope("all");
    setQuery("");
    setExpanded(new Set());
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
  if (!isOwner && (!participantReady || (searchParams.get("invite") === "1" && !inviteSeen))) return <ParticipantJoinScreen onEnter={enterFromInvite} />;

  const target = project.target;
  const pickedTotal = picked.size;
  const hasQuality = scenePhotos.some(isBlurFlagged);
  // 인물 구성 칩: 지금 장면에 판정된 사진이 있을 때만, 장수가 있는 구성만 보인다.
  const peopleCounts = PEOPLE_KINDS.map((kind) => ({ kind, count: scenePhotos.filter((photo) => photo.people === kind).length })).filter((item) => item.count > 0);
  // 켜고 끄는 토글(다시 누르면 풀림) — "모두" 칩은 두지 않는다(보기 범위의 "전체"와 겹쳐 헷갈림).
  const peopleChips = peopleCounts.length > 1 ? peopleCounts.map(({ kind, count }) => (
    <button key={kind} type="button" aria-pressed={peopleFilter === kind} onClick={() => setPeopleFilter(peopleFilter === kind ? null : kind)}>
      {peopleLabel(kind, project.shootType)}<b>{count}</b>
    </button>
  )) : null;
  const myDone = Boolean(project.participantDone[me]);
  const toReview = () => router.push(`/customer-select/${projectId}/review`);
  const withChat = people.length > 1;

  // AI 장면은 이름이 제목, 시간대는 보조 정보. 이름이 없으면(시간 장면) 시간대가 제목이다.
  const sceneTitle = (item: NamedScene) => item.name ?? (scenes && scenes.length > 1 ? formatSceneRange(item) : "전체 사진");
  // 장면별 진행: 찜 수(누구든) → 최종 선택 수/목표. 참여자는 내 찜 수만.
  const likedInScene = (item: NamedScene) => item.photoIds.filter((id) => likesOf(id).length > 0).length;
  const sceneCount = (index: number) => {
    const count = pickedInScene(scenes![index]);
    if (!isOwner) return count ? `♥${count}` : "";
    const liked = likedInScene(scenes![index]);
    return `${liked ? `♥${liked} · ` : ""}✓${count}${targets[index] ? `/${targets[index]}` : ""}`;
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
        ? <em className={s.sceneProgress}>{likedInScene(item) > 0 && <i>♥{likedInScene(item)}</i>}<b className={sceneDone(index) ? s.done : ""}>✓{pickedInScene(item)}{targets[index] ? `/${targets[index]}` : ""}</b></em>
        : <em>{sceneCount(index)}</em>}
    </button>
  ));

  // 참여자: 색 아바타(이름 첫 글자)만 겹쳐 놓는다. 온라인은 초록 점, 다 골랐으면 ✓, 이름·상태는 마우스를 올리면 보인다.
  // 보는 사진이 있는 참여자는 눌러서 같은 사진을 연다. 혼자일 때는 아바타 없이 초대 버튼만.
  const peopleBar = (
    <div className={s.people}>
      {people.length > 1 && (
        <span className={ui.avatars} role="list" aria-label="함께 고르는 사람">
          {people.map((person) => {
            const isOnline = online.has(person.id);
            if (person.id === me) return <NicknamePrompt key={person.id} hex={person.hex} isDone={myDone} online={isOnline} />;
            const done = project.participantDone[person.id];
            const viewingId = project.participantViews?.[person.id];
            const viewing = viewingId && isOnline ? photoById.get(viewingId) : undefined;
            const label = [person.name, done ? "다 골랐어요" : null, viewing ? "보는 사진 열기" : isOnline ? "온라인" : null].filter(Boolean).join(" · ");
            const className = `${ui.avatar} ${isOnline ? ui.avatarOnline : ""} ${viewing ? ui.avatarViewing : ""}`;
            const content = <>{person.name.slice(0, 1)}{done ? <span className={ui.avatarDone} aria-hidden>✓</span> : null}</>;
            return viewing
              ? <button key={person.id} type="button" role="listitem" className={className} style={{ background: person.hex }} title={label} aria-label={label} onClick={() => setOpenPhotoId(viewing.id)}>{content}</button>
              : <span key={person.id} role="listitem" className={className} style={{ background: person.hex }} title={label} aria-label={label}>{content}</span>;
          })}
        </span>
      )}
      {isOwner && <button type="button" className={s.inviteButton} aria-label="초대" onClick={() => setSheet("invite")}><Plus size={14} /><span className={s.inviteLabel}>초대</span></button>}
    </div>
  );

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
        highlighted={isCover && members.some((member) => selectedIds.has(member.id))}
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
        onCheckClick={(event) => { event.preventDefault(); event.stopPropagation(); store.toggleSelect(photo.id); }}
        onLikeClick={(event) => { event.preventDefault(); event.stopPropagation(); store.toggleLike(photo.id, me); }}
        popOnSelect={isOwner}
        onRate={() => {}}
        onThumbError={() => {}}
      />
    );
  };

  // 보기 범위: 회색 트랙 하나(전체 · 찜 ▾ · 최종 선택) — 지금 장면 기준 장수. 찜 세부 범위는 ▾ 메뉴에서. 보이는 글자는 짧게, 읽어 주는 이름(aria)은 원래 이름.
  const countIn = (test: (photo: Photo) => boolean) => scenePhotos.filter(test).length;
  const likeOptions: { value: Scope; label: string; ariaLabel: string; menuLabel: string; count: number; show: boolean }[] = [
    { value: "liked", label: "♥ 찜", ariaLabel: "♥ 찜한 사진", menuLabel: "누구든 찜", count: countIn((photo) => likesOf(photo.id).length > 0), show: true },
    { value: "mine", label: "♡ 내 찜", ariaLabel: "♡ 내 찜", menuLabel: "내 찜", count: countIn((photo) => myLikes.has(photo.id)), show: true },
    { value: "popular", label: "♥ 2명 이상", ariaLabel: "찜 2명 이상", menuLabel: "2명 이상 찜", count: countIn((photo) => likesOf(photo.id).length >= 2), show: people.length > 1 },
  ];
  const likeActive = LIKE_SCOPES.includes(scope);
  const likeOption = likeOptions.find((option) => option.value === (likeActive ? scope : "liked"))!;
  const optionCount = (hasGroups && grouped ? 1 : 0) + (hasQuality && setAside ? 1 : 0);

  // 장면 끝의 얇은 안내: 다음 장면 이름(당기면 넘어간다는 신호), 마지막 장면이면 보내기.
  const sceneFooter = scene ? (nextScene
    ? <p className={s.sceneNext}><ArrowDown size={14} aria-hidden /><span>다음</span><strong>{sceneTitle(nextScene)}</strong></p>
    : <div className={s.sceneEnd}>
        <span>마지막 장면 · {isOwner ? `전체 최종 선택 ${pickedTotal}장` : `전체 찜 ${pickedTotal}장`}</span>
        {isOwner
          ? <PhotographerLightButton size="toolbar" disabled={!pickedTotal} onClick={toReview}>작가에게 보내기 →</PhotographerLightButton>
          : <PhotographerLightButton size="toolbar" variant={myDone ? "outline" : "primary"} onClick={() => store.toggleDone(me)}>{myDone ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>}
      </div>) : undefined;

  const totalText = `최종 선택 ${pickedTotal}장${target ? ` · 약속한 ${target}장` : ""}`;
  const bottomBar = !isOwner ? <>
    <div className={s.barMeta}><strong>내가 찜한 사진 {myLikes.size}장</strong><span>최종 선택은 {project.participantNicknames.red || "소유자"}님이 해요</span></div>
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
      compactTitle={<ProjectStepHeader projectId={projectId} name={project.name} step="select" isOwner={isOwner} />}
      headerActions={peopleBar}
    >
      <div className={s.page} data-chat={withChat ? "" : undefined}>

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
            {backgroundBanner}
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
              <div className={s.tools} style={sceneMode || analysisBanner || backgroundBanner ? { paddingTop: 10 } : undefined}>
                <div className={s.segments} role="group" aria-label="보기 범위">
                  <button type="button" aria-pressed={scope === "all"} aria-label="전체" onClick={() => setScope("all")}>전체<b>{scenePhotos.length}</b></button>
                  <span className={s.segmentSplit}>
                    <button type="button" aria-pressed={likeActive} aria-label={likeOption.ariaLabel} onClick={() => setScope(likeOption.value)}>{likeOption.label}<b>{likeOption.count}</b></button>
                    <button type="button" className={s.segmentCaret} aria-label="찜 범위 바꾸기" aria-haspopup="menu" aria-expanded={menu === "like"} onClick={() => setMenu(menu === "like" ? null : "like")}><ChevronDown size={14} /></button>
                  </span>
                  <button type="button" aria-pressed={scope === "picked"} aria-label="✓ 최종 선택" onClick={() => setScope("picked")}>✓ 최종 선택<b>{countIn((photo) => selectedIds.has(photo.id))}</b></button>
                </div>
                {/* 인물 칩: PC는 툴바 줄에(줄 수를 줄인다), 모바일은 아래 별도 줄(가로 스크롤). */}
                {peopleChips && <div className={`${s.peopleChips} ${s.peopleChipsInline}`} role="group" aria-label="인물 구성">{peopleChips}</div>}
                <span className={s.toolsSpacer} />
                {searchOpen || query
                  ? <input className={`${s.search} ${s.desktopOnly}`} type="search" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} onBlur={() => { if (!query) setSearchOpen(false); }} placeholder="파일명 검색" aria-label="파일명 검색" />
                  : <button type="button" className={`${s.iconTool} ${s.desktopOnly}`} aria-label="파일명 검색 열기" title="파일명 검색" onClick={() => setSearchOpen(true)}><Search size={16} /></button>}
                {/* 모바일은 파일명 검색 대신 보기 크기(크게 2열·중간 3열·작게 4열). */}
                <button type="button" className={`${s.iconTool} ${s.mobileOnly}`} aria-label={`보기 크기: ${sizeLabel[mobileColumns]}`} title="보기 크기" aria-haspopup="menu" aria-expanded={menu === "size"} onClick={() => setMenu(menu === "size" ? null : "size")}>
                  {mobileColumns === 2 ? <Grid2x2 size={16} /> : mobileColumns === 3 ? <Grid3x3 size={16} /> : <Grip size={16} />}
                </button>
                <button type="button" className={s.iconTool} aria-label="보기 옵션" title="보기 옵션" aria-haspopup="dialog" aria-expanded={menu === "options"} onClick={() => setMenu(menu === "options" ? null : "options")}>
                  <SlidersHorizontal size={16} />{optionCount > 0 && <i>{optionCount}</i>}
                </button>
              </div>
              {menu === "like" && (
                <div className={`${s.toolsMenu} ${s.toolsMenuLeft}`} role="menu" aria-label="찜 범위">
                  {likeOptions.filter((option) => option.show).map((option) => (
                    <button key={option.value} type="button" role="menuitemradio" aria-checked={likeOption.value === option.value && likeActive} onClick={() => { setScope(option.value); setMenu(null); }}>
                      <span>{option.menuLabel}</span><b>{option.count}</b>
                    </button>
                  ))}
                </div>
              )}
              {menu === "size" && (
                <div className={s.toolsMenu} role="menu" aria-label="보기 크기">
                  {([2, 3, 4] as MobileColumns[]).map((count) => (
                    <button key={count} type="button" role="menuitemradio" aria-checked={mobileColumns === count} onClick={() => { setMobileColumns(count); setMenu(null); }}>
                      <span>{sizeLabel[count]}</span><b>한 줄에 {count}장</b>
                    </button>
                  ))}
                </div>
              )}
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
                  {peopleChips && <div className={s.peopleMenuRow}><strong>인물</strong><div className={s.peopleChips} role="group" aria-label="인물 구성">{peopleChips}</div></div>}
                  {!hasGroups && !hasQuality && <p className={s.toolsMenuEmpty}>AI로 정리하면 유사컷 묶기·흔들림 빼기를 쓸 수 있어요</p>}
                  {isOwner && (analysis.status === "ready" || analysis.status === "fallback") && (
                    <button type="button" className={s.retidyRow} onClick={() => { setMenu(null); setAiError(null); setSheet("ai"); }}>
                      <span><strong>AI 다시 정리</strong><small>{analysis.newPhotoCount ? `새로 올린 ${analysis.newPhotoCount}장까지 장면·유사컷을 다시 나눠요` : "장면·유사컷을 다시 나눠요. 고른 사진·찜·메모는 그대로예요"}</small></span>
                      <Sparkles size={15} aria-hidden />
                    </button>
                  )}
                </div>
              )}
              </div>
              {/* 모바일: 인물 칩은 보기 옵션 안에 있고, 고른 동안만 안내 줄로 알린다(PC는 툴바 줄에 칩이 보인다). */}
              {peopleFilter && (
                <p className={`${s.toolsNote} ${s.peopleNote}`}>
                  <span><strong>{peopleLabel(peopleFilter, project.shootType)}</strong>만 보는 중</span>
                  <button type="button" onClick={() => setPeopleFilter(null)}>해제</button>
                </p>
              )}
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
                <div className={s.quickPill} data-locked-bar>
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
            <div className={s.bottomBar} data-locked-bar>{bottomBar}</div>
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
