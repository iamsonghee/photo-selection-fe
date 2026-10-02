"use client";

/**
 * 셀프 고객 ③ 작가에게 보내기.
 * 주요 행동(결과 링크 보내기)을 위에 두고, 확인할 점은 막지 않고 링크로만 안내한다.
 * 결과 링크는 항상 최신 선택을 보여주므로 보내기가 선택을 잠그거나 상태를 바꾸지 않는다.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Copy, FileSpreadsheet, FileText, MessageSquare, Send } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import { csvEscape, downloadTextFile, sanitizeFilenamePart } from "@/lib/text-file-download";
import { formatSceneRange } from "@/lib/customer-scenes";
import type { Photo } from "@/types";
import { activeParticipants, useCustomerSelectStore } from "../../_lib/real-store";
import { CustomerSelectShell } from "../../_lib/CustomerSelectShell";
import { ProjectStepHeader } from "../../_lib/ProjectStepHeader";
import { PhotoDetail } from "../select/PhotoDetail";
import { useSceneAnalysis, type NamedScene } from "../select/useSceneAnalysis";
import s from "./review.module.css";

type Notice = { key: string; text: string; href?: string };

export default function CustomerSendPage() {
  return <Suspense fallback={<SystemLoadingScreen title="보낼 사진을 불러오고 있어요" homeHref="/customer-select" />}><SendScreen /></Suspense>;
}

const sceneLabel = (scene: NamedScene) => scene.name ? `${scene.name}${scene.start ? ` (${formatSceneRange(scene)})` : ""}` : formatSceneRange(scene);

function SendScreen() {
  const projectId = useParams().projectId as string;
  const router = useRouter();
  const store = useCustomerSelectStore();
  const { project, hydrated, isOwner, currentIdentity: me, syncStatus } = store;
  const [linkState, setLinkState] = useState<"idle" | "loading" | "copied" | "shared" | "fail">("idle");
  const [listCopied, setListCopied] = useState(false);
  // 상세를 연 동안에는 목록을 고정한다 — 상세에서 선택을 빼도 앞뒤 이동이 흔들리지 않게.
  const [detail, setDetail] = useState<{ photos: Photo[]; id: string } | null>(null);
  // 보정본 확인(비교·재보정 정리)은 아직 열지 않았다 — 누르면 준비 중 안내만 보인다.
  const [retouchSoon, setRetouchSoon] = useState(false);

  useEffect(() => {
    if (hydrated && !isOwner) router.replace(`/customer-select/${projectId}/select`);
  }, [hydrated, isOwner, projectId, router]);

  const selectedIds = useMemo(() => new Set(project.selectedIds), [project.selectedIds]);
  const selected = useMemo(() => project.photos.filter((photo) => selectedIds.has(photo.id)), [project.photos, selectedIds]);
  // AI 장면(이름)을 넘겨야 고르기 화면과 같은 장면·이름으로 묶인다(빠뜨리면 촬영 시각으로 다시 나눈 시간대가 나온다).
  const { scenes } = useSceneAnalysis(projectId, project.photos, project.shootType, project.aiScenes);
  const people = useMemo(() => activeParticipants(project), [project]);
  const memoOf = (id: string) => project.photoStates[id]?.comment?.trim() ?? "";
  const memoCount = selected.filter((photo) => memoOf(photo.id)).length;

  const sections = useMemo(() => {
    if (!scenes || scenes.length < 2) return [{ title: "", sceneIndex: null as number | null, photos: selected }];
    return scenes.map((scene, index) => ({
      title: sceneLabel(scene),
      sceneIndex: index,
      photos: scene.photoIds.filter((id) => selectedIds.has(id)).flatMap((id) => project.photos.find((photo) => photo.id === id) ?? []),
    })).filter((section) => section.photos.length);
  }, [project.photos, scenes, selected, selectedIds]);

  const notices = useMemo<Notice[]>(() => {
    const list: Notice[] = [];
    const selectHref = (scene?: number) => `/customer-select/${projectId}/select${scene === undefined ? "" : `?scene=${scene}`}`;
    // 장면마다 골랐는지는 확인하지 않는다 — 장면 수만큼 줄이 쌓여 소음이 되고, 장면을 고르게 채울 필요도 없다.
    const byGroup = new Map<string, Photo[]>();
    selected.forEach((photo) => { if (photo.similarityGroupId) byGroup.set(photo.similarityGroupId, [...(byGroup.get(photo.similarityGroupId) ?? []), photo]); });
    const multi = Array.from(byGroup.values()).filter((members) => members.length > 1);
    const multiScene = scenes?.findIndex((scene) => multi.length > 0 && scene.photoIds.includes(multi[0][0].id)) ?? -1;
    if (multi.length) list.push({ key: "multi", text: `비슷한 사진 묶음 ${multi.length}곳에서 2장 이상 골랐어요`, href: selectHref(multiScene >= 0 ? multiScene : undefined) });
    const suspect = selected.filter((photo) => photo.isBlurry || (photo.faceDetected && photo.eyesClosed));
    if (suspect.length) list.push({ key: "quality", text: `흔들림·눈 감음 의심 사진 ${suspect.length}장이 들어 있어요` });
    const waiting = people.filter((person) => person.id !== me && !project.participantDone[person.id]);
    if (waiting.length) list.push({ key: "waiting", text: `${waiting.map((person) => person.name).join(", ")}님이 아직 고르는 중이에요` });
    return list;
  }, [me, people, project.participantDone, projectId, scenes, selected]);

  if (!hydrated || !isOwner) return <SystemLoadingScreen title="보낼 사진을 불러오고 있어요" homeHref="/customer-select" />;

  const target = project.target;
  const diff = selected.length - target;
  const summary = !target || !selected.length ? "" : diff === 0 ? `약속한 ${target}장과 같아요` : `약속한 ${target}장보다 ${Math.abs(diff)}장 ${diff > 0 ? "많아요" : "적어요"}`;
  const listText = [`[${project.name || "사진 셀렉"}] 선택 사진 ${selected.length}장`, ...selected.map((photo) => memoOf(photo.id) ? `${getPhotoDisplayName(photo)} — ${memoOf(photo.id)}` : getPhotoDisplayName(photo))].join("\n");
  const baseName = `${sanitizeFilenamePart(project.name || "사진셀렉")}_selections`;
  const canSend = selected.length > 0 && syncStatus === "connected" && linkState !== "loading";

  async function resultUrl() {
    const response = await fetch(`/api/customer-select/projects/${projectId}/result-link`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || "결과 링크를 만들지 못했어요.");
    return `${window.location.origin}${result.url}`;
  }

  async function sendLink(mode: "share" | "copy") {
    setLinkState("loading");
    try {
      const url = await resultUrl();
      if (mode === "share" && navigator.share) {
        try {
          await navigator.share({ title: `${project.name} 선택 결과`, text: `선택한 사진 ${selected.length}장과 요청 사항이에요.`, url });
          setLinkState("shared");
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") { setLinkState("idle"); return; }
          await navigator.clipboard.writeText(url);
          setLinkState("copied");
        }
      } else {
        await navigator.clipboard.writeText(url);
        setLinkState("copied");
      }
    } catch {
      setLinkState("fail");
    }
    setTimeout(() => setLinkState("idle"), 2500);
  }

  async function copyList() {
    try { await navigator.clipboard.writeText(listText); } catch { window.prompt("아래 내용을 복사해 주세요", listText); }
    setListCopied(true);
    setTimeout(() => setListCopied(false), 2000);
  }

  return (
    <CustomerSelectShell compactHeader compactTitle={<ProjectStepHeader projectId={projectId} name={project.name} step="send" />}>
      <main className={s.main}>
        {selected.length === 0 ? (
          <section className={s.empty}>
            <h2>아직 고른 사진이 없어요</h2>
            <p>보정 받을 사진을 고르면 여기서 작가님께 보낼 수 있어요.</p>
            <PhotographerLightButton size="work-panel" onClick={() => router.push(`/customer-select/${projectId}/select`)}>사진 고르러 가기</PhotographerLightButton>
          </section>
        ) : <>
          <section className={s.hero}>
            <h2>{selected.length}장을 보낼게요</h2>
            <p>{[summary, memoCount ? `메모 ${memoCount}개` : ""].filter(Boolean).join(" · ") || "선택한 사진과 메모를 작가님께 보내요"}</p>
          </section>

          {notices.length > 0 && (
            <section className={s.notices} aria-label="보내기 전에 확인할 점">
              {notices.map((notice) => (
                <div key={notice.key} className={s.notice}>
                  <AlertTriangle size={15} aria-hidden />
                  <span>{notice.text}</span>
                  {notice.href && <Link href={notice.href}>보러 가기</Link>}
                </div>
              ))}
              <p className={s.noticeHint}>확인만 해주세요. 그대로 보내도 괜찮아요.</p>
            </section>
          )}

          <section className={s.sendCard}>
            <div className={s.sendText}>
              <h3>작가님께 보내기</h3>
              <p>링크를 받은 작가님은 로그인 없이 사진·파일명·메모를 보고 파일명 목록을 받을 수 있어요. 나중에 다시 골라도 같은 링크에 최신 선택이 보여요.</p>
            </div>
            {syncStatus !== "connected" && <p className={s.syncWarn} role="status">최신 선택을 확인하는 중이에요. 연결되면 보낼 수 있어요.</p>}
            <div className={s.sendActions}>
              <PhotographerLightButton size="confirmation" disabled={!canSend} onClick={() => void sendLink("share")}>
                <Send size={18} />{linkState === "loading" ? "링크 만드는 중…" : linkState === "shared" ? "보냈어요" : linkState === "copied" ? "링크를 복사했어요" : linkState === "fail" ? "다시 시도하기" : "결과 링크 보내기"}
              </PhotographerLightButton>
              <PhotographerLightButton variant="outline" size="confirmation" disabled={!canSend} onClick={() => void sendLink("copy")}><Copy size={18} />링크 복사</PhotographerLightButton>
            </div>
            <div className={s.fileLinks}>
              <button type="button" onClick={() => void copyList()}><FileText size={14} />{listCopied ? "복사했어요" : "파일명·메모 복사"}</button>
              <button type="button" onClick={() => downloadTextFile(`${baseName}.csv`, ["파일명,작가 전달 메모", ...selected.map((photo) => [csvEscape(getPhotoDisplayName(photo)), csvEscape(memoOf(photo.id))].join(","))].join("\n"), "text/csv;charset=utf-8")}><FileSpreadsheet size={14} />CSV 다운로드</button>
              <button type="button" onClick={() => downloadTextFile(`${baseName}.txt`, selected.map(getPhotoDisplayName).join("\n"), "text/plain;charset=utf-8")}><FileText size={14} />TXT 다운로드</button>
            </div>
          </section>

          <section className={s.photos}>
            <div className={s.photosHead}>
              <h3>보낼 사진</h3>
              <Link href={`/customer-select/${projectId}/select`}>다시 고르기</Link>
            </div>
            {sections.map((section) => (
              <div key={section.sceneIndex ?? "all"} className={s.section}>
                {section.title && <p className={s.sectionTitle}>{section.title} <span>{section.photos.length}장</span></p>}
                <div className={s.grid}>
                  {section.photos.map((photo) => (
                    <button key={photo.id} type="button" className={s.thumb} aria-label={`${getPhotoDisplayName(photo)} 크게 보기`} onClick={() => setDetail({ photos: selected, id: photo.id })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" />
                      {memoOf(photo.id) && <i aria-label="메모 있음"><MessageSquare size={12} /></i>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className={s.retouch}>
            <div><h3>보정본을 받으면</h3><p>원본과 나란히 비교하고 다시 보정할 사진을 정리할 수 있어요. 필요할 때만 쓰면 돼요.</p></div>
            <PhotographerLightButton variant="outline" size="work-panel" onClick={() => setRetouchSoon(true)}>보정본 확인하기</PhotographerLightButton>
            {retouchSoon && <p className={s.retouchSoon} role="status">보정본 확인은 아직 준비 중이에요. 곧 열어 드릴게요.</p>}
          </section>
        </>}
      </main>

      {detail && (
        <PhotoDetail
          photos={detail.photos}
          photoId={detail.id}
          onPhotoChange={(id) => setDetail((current) => current && { ...current, id })}
          onClose={() => setDetail(null)}
          isOwner
          myColor={me}
          people={people}
          selectedIds={selectedIds}
          likesOf={(id) => project.photoStates[id]?.color ?? []}
          commentOf={(id) => project.photoStates[id]?.comment ?? ""}
          similarOf={(photo) => photo.similarityGroupId ? project.photos.filter((member) => member.similarityGroupId === photo.similarityGroupId) : []}
          commentSaveStates={store.commentSaveStates}
          onToggleSelect={store.toggleSelect}
          onToggleLike={(id) => store.toggleLike(id, me)}
          onSaveComment={store.setComment}
          selectedCount={selectedIds.size}
          target={target}
        />
      )}
    </CustomerSelectShell>
  );
}
