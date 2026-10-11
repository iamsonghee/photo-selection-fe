import type { ColorTag } from "@/types";

/** 공유 링크 안의 참여 색·이름은 서버 명단에, 이 기기의 참여 색은 localStorage에 보관한다. */
export type Participant = {
  color: ColorTag;
  /** 기존 저장 키와 호환되는 표시 이름. 서버 명단과 함께 최대 20글자를 보관한다. */
  initial: string;
};

const STORAGE_PREFIX = "ps:c-participant:v1:";

const storageKey = (token: string) => `${STORAGE_PREFIX}${token}`;

export function readParticipant(token: string): Participant | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Participant>;
    if (!parsed || !["red", "yellow", "green", "blue", "purple"].includes(parsed.color ?? "")) return null;
    return { color: parsed.color as ColorTag, initial: typeof parsed.initial === "string" ? parsed.initial.slice(0, 20) : "" };
  } catch {
    return null;
  }
}

export function writeParticipant(token: string, participant: Participant): void {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(storageKey(token), JSON.stringify(participant));
  } catch {
    /* 시크릿 모드 등 저장 불가 환경에서는 이번 세션에만 유지된다 */
  }
}

/** 프로젝트별 (색 → 표시 이름) 명단. 모든 참가자가 공유하므로 서버에 저장한다. */
export type ParticipantRoster = Partial<Record<ColorTag, string>>;

export async function fetchRoster(token: string, projectId: string): Promise<ParticipantRoster> {
  const res = await fetch(
    `/api/c/participants?token=${encodeURIComponent(token)}&project_id=${encodeURIComponent(projectId)}`,
  );
  if (!res.ok) return {};
  const body = (await res.json()) as { participants?: { color: ColorTag; nickname: string }[] };
  const roster: ParticipantRoster = {};
  for (const row of body.participants ?? []) roster[row.color] = row.nickname;
  return roster;
}

export async function saveRosterName(
  token: string,
  projectId: string,
  color: ColorTag,
  nickname: string,
): Promise<void> {
  const response = await fetch("/api/c/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId, color, nickname }),
  });
  if (!response.ok) throw new Error("이름을 저장하지 못했어요. 다시 시도해 주세요.");
}

/** 사진에 찜을 남긴 색. 아직 찜하지 않은 참여자는 서버 명단에서 별도로 합친다. */
export function getUsedColors(
  photoStates: Record<string, { color?: ColorTag[] } | undefined>,
): ColorTag[] {
  const used = new Set<ColorTag>();
  for (const state of Object.values(photoStates)) {
    for (const color of state?.color ?? []) used.add(color);
  }
  return [...used];
}
