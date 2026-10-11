"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { Check, Copy, Plus, User, Users } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { COLOR_OPTIONS, COLOR_LABELS } from "@/lib/gallery-filter";
import { readParticipant, writeParticipant, type Participant, type ParticipantRoster } from "@/lib/customer-participant";
import type { ColorTag } from "@/types";
import s from "./CustomerCollaboration.module.css";

type Member = { color: ColorTag; nickname: string; done: boolean; online: boolean };
type Collaboration = {
  participant: Participant | null;
  members: Member[];
  roster: ParticipantRoster;
  openPeople: () => void;
  requestParticipation: () => void;
  toggleLike: (photoId: string) => void;
};
const Context = createContext<Collaboration | null>(null);
export const useCustomerCollaboration = () => useContext(Context);

export function CustomerPeople() {
  const team = useCustomerCollaboration();
  if (!team) return null;
  const together = team.members.length > 1;
  const name = team.members.find((member) => member.color === team.participant?.color)?.nickname || team.participant?.initial || "참여하기";
  const label = together ? `함께 ${team.members.length}` : name;
  return <div className={s.controls}>
    <button type="button" onClick={team.participant ? team.openPeople : team.requestParticipation} className={s.peopleButton} aria-label={!team.participant ? "참여하기" : together ? `함께 고르는 사람 ${team.members.length}명` : `${name}, 내 참여 정보`} title={label}>
      {together ? <Users size={16} aria-hidden /> : <User size={16} aria-hidden />}<span className={s.peopleLabel}>{team.participant ? label : "참여하기"}</span>
    </button>
    <button type="button" className={s.peopleButton} onClick={team.openPeople} aria-label="함께 고르기 초대"><Plus size={16} aria-hidden /><span>초대</span></button>
  </div>;
}

export function CustomerCollaborationProvider({ children }: { children: ReactNode }) {
  const token = useParams().token as string;
  const pathname = usePathname();
  const { project, loading, toggleColor, photoStates } = useSelection();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [joining, setJoining] = useState(false);
  const pendingAction = useRef<((color: ColorTag) => void) | null>(null);
  const [name, setName] = useState("");
  const [resumeColor, setResumeColor] = useState<ColorTag | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestSeq = useRef(0);
  const projectId = project?.id;
  const choosing = project?.status === "selecting" && Boolean(pathname?.includes("/gallery") || pathname?.includes("/viewer/"));

  useEffect(() => {
    setParticipant(readParticipant(token));
    setMembers([]); setReady(false); setPeopleOpen(false); setEditingName(false); setError(null);
    return () => { requestSeq.current += 1; };
  }, [token]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const seq = ++requestSeq.current;
    try {
      const response = await fetch(`/api/c/participants?token=${encodeURIComponent(token)}&project_id=${projectId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (seq !== requestSeq.current) return;
      setMembers(body.participants); setReady(true); setLoadError(false);
    } catch { if (seq === requestSeq.current) setLoadError(true); }
  }, [projectId, token]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/c/participants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, project_id: projectId, ...body }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "참여 정보를 저장하지 못했어요.");
    return result;
  }, [projectId, token]);

  useEffect(() => {
    if (!choosing) return;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); requestSeq.current += 1; };
  }, [choosing, refresh]);

  useEffect(() => {
    if (!choosing || !participant || !projectId) return;
    const heartbeat = () => {
      if (!document.hidden) void post({ action: "heartbeat", color: participant.color }).catch(() => {});
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 10_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); };
  }, [choosing, participant, post, projectId]);

  const member = members.find((item) => item.color === participant?.color);
  const registering = joining || editingName;
  const roster = useMemo(() => Object.fromEntries(members.map((item) => [item.color, item.nickname])) as ParticipantRoster, [members]);

  const remember = (color: ColorTag, nickname: string) => {
    const next = { color, initial: nickname };
    writeParticipant(token, next); setParticipant(next); setEditingName(false); setResumeColor(null); setName("");
    setJoining(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.(color);
  };
  const requestParticipation = (action?: (color: ColorTag) => void) => {
    if (participant && (member?.nickname.trim() || participant.initial.trim())) { action?.(participant.color); return; }
    pendingAction.current = action ?? null;
    setError(null); setPeopleOpen(false); setJoining(true);
    void refresh();
  };
  const saveName = async () => {
    if (busy || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      const color = resumeColor ?? participant?.color;
      if (color) { await post({ color, nickname: name.trim() }); remember(color, name.trim()); }
      else { const result = await post({ action: "join", nickname: name.trim() }); remember(result.color, result.nickname); }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요."); await refresh(); }
    finally { setBusy(false); }
  };
  const resume = async (item: Member) => {
    if (!item.nickname.trim()) { setResumeColor(item.color); setName(""); return; }
    setBusy(true); setError(null);
    try { await post({ action: "heartbeat", color: item.color }); remember(item.color, item.nickname); }
    catch { setError("참여 정보를 확인하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const toggleDone = async () => {
    if (!participant || busy) return;
    setBusy(true); setError(null);
    try { await post({ color: participant.color, done: !member?.done }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  const share = async () => {
    if (!project) return;
    const url = `${window.location.origin}/c/${token}`;
    const text = `${url}${project.accessPin ? `\n비밀번호: ${project.accessPin}` : ""}`;
    setError(null);
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setError("복사하지 못했어요. 아래 접속 정보를 직접 복사해 주세요."); }
  };

  return <Context.Provider value={{ participant, members, roster, requestParticipation: () => requestParticipation(), toggleLike: (photoId) => {
    const registered = participant && (member?.nickname.trim() || participant.initial.trim());
    requestParticipation((color) => { if (registered || !photoStates[photoId]?.color?.includes(color)) toggleColor(photoId, color); });
  }, openPeople: () => { setPeopleOpen(true); setError(null); setCopied(false); } }}>
    {children}
    <PhotographerModal open={Boolean(choosing && !loading && registering)} onClose={() => { setEditingName(false); setJoining(false); setResumeColor(null); pendingAction.current = null; }} closeDisabled={busy}
      title={!ready ? "참여 정보를 확인하고 있어요" : editingName ? "내 이름 바꾸기" : "어떤 이름으로 함께할까요?"}
      description={ready ? "찜은 각자 남기고, 최종 선택은 함께 바꿀 수 있어요." : undefined} maxWidth={420}>
      {!ready ? <p role={loadError ? "alert" : "status"}>{loadError ? <>참여 정보를 불러오지 못했어요. <button className={s.textButton} onClick={() => void refresh()}>다시 시도</button></> : "잠시만 기다려 주세요."}</p> : <>
        <form onSubmit={(event) => { event.preventDefault(); void saveName(); }} className={s.form}>
          <label>이름<input value={name} onChange={(event) => setName(event.target.value)} maxLength={20} placeholder="예: 신랑, 엄마, 지우" data-dialog-autofocus disabled={busy} /></label>
          <p>{participant || resumeColor ? "이전에 찜한 사진은 그대로 이어져요." : "나를 구분할 색은 자동으로 정해져요."}</p>
          <PhotographerLightButton type="submit" disabled={busy || !name.trim()}>{busy ? "저장 중…" : editingName ? "이름 저장" : "함께 고르기 시작"}</PhotographerLightButton>
        </form>
        {!editingName && !participant && members.length > 0 && <div className={s.resume}>
          <p>이전에 참여했다면 내 이름을 선택해 주세요.</p>
          {members.map((item) => <button type="button" disabled={busy} key={item.color} onClick={() => void resume(item)}>{item.nickname || `${COLOR_LABELS[item.color]}로 이어하기`}</button>)}
        </div>}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </>}
      {!editingName && <a className={s.back} href={`/c/${token}`}>초대 화면으로 돌아가기</a>}
    </PhotographerModal>
    <PhotographerModal open={peopleOpen && !registering} onClose={() => setPeopleOpen(false)} title="함께 고르기" maxWidth={440}>
      <div className={s.panel}>
        <p>각자의 찜을 참고해서 함께 최종 선택해 주세요.</p>
        {members.map((item) => <div className={s.person} key={item.color}>
          <i style={{ background: COLOR_OPTIONS.find((option) => option.key === item.color)?.hex }} aria-hidden />
          <strong>{item.nickname || COLOR_LABELS[item.color]}{item.color === participant?.color ? " (나)" : ""}</strong>
          <span>{item.online ? "온라인" : "자리 비움"}{item.done && <><Check size={14} aria-hidden />다 골랐어요</>}</span>
          {item.color === participant?.color && <button className={s.textButton} onClick={() => { setPeopleOpen(false); setName(item.nickname); setEditingName(true); }}>이름 수정</button>}
        </div>)}
        {participant && <PhotographerLightButton variant={member?.done ? "outline" : "primary"} disabled={busy || !ready || loadError} onClick={() => void toggleDone()}>{member?.done ? "다시 고르기" : "다 골랐어요"}</PhotographerLightButton>}
        {!participant && <PhotographerLightButton onClick={() => requestParticipation()}>참여하기</PhotographerLightButton>}
        <p>내 완료 표시만 바뀌어요. 사진은 계속 고를 수 있고, 작가에게 보내려면 보정 요청을 해 주세요.</p>
        <div className={s.share}>
          <strong>링크로 초대하기</strong>
          <p>이 링크로 최종 선택·보정 요청을 함께 할 수 있어요. 제공되는 원본과 이후 보정본도 볼 수 있어요.</p>
          <label>초대 링크<input readOnly value={typeof window === "undefined" ? "" : `${window.location.origin}/c/${token}`} onFocus={(event) => event.target.select()} /></label>
          {project?.accessPin && <label>비밀번호<input readOnly value={project.accessPin} onFocus={(event) => event.target.select()} /></label>}
          <PhotographerLightButton variant="outline" onClick={() => void share()}><Copy size={15} aria-hidden />{copied ? "복사했어요" : project?.accessPin ? "링크·비밀번호 복사" : "링크 복사"}</PhotographerLightButton>
          <span role="status" className={s.copyStatus}>{copied ? "초대 정보를 복사했어요." : ""}</span>
        </div>
        {loadError && <p role="alert">접속 상태를 확인하지 못했어요. <button className={s.textButton} onClick={() => void refresh()}>다시 시도</button></p>}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
    </PhotographerModal>
  </Context.Provider>;
}
