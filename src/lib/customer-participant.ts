import type { ColorTag } from "@/types";

/**
 * 고객 셀렉은 링크 + PIN을 여러 사람이 함께 쓰는 구조라 서버가 "지금 요청한 사람"을 구분하지 못한다.
 * 그래서 기존 사진 태그의 색(`ColorTag`)을 참가자 슬롯으로 재해석해 "누가 찜했는지"를 표현한다.
 *
 * - 어떤 색이 쓰이고 있는지(=명단)는 사진 태그에서 역산하므로 별도 저장이 필요 없다.
 * - "이 기기가 그중 누구인지"만 localStorage에 남긴다. 기기를 바꾸거나 저장소가 비워지면
 *   진입 시 "누구세요?" 시트에서 기존 색을 한 번 탭해 되찾는다.
 */
export type Participant = {
  color: ColorTag;
  /** 본인 화면에서 자기 마크를 구분하기 위한 1~2글자. 기기에만 저장돼 다른 참가자에게는 보이지 않는다. */
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
    if (!parsed || typeof parsed.color !== "string") return null;
    return { color: parsed.color as ColorTag, initial: (parsed.initial ?? "").slice(0, 2) };
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
  await fetch("/api/c/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId, color, nickname }),
  });
}

/** 프로젝트 안에서 실제로 쓰인 색 = 현재 참여 중인 사람들. 별도 명단 저장 없이 사진 태그에서 역산한다. */
export function getUsedColors(
  photoStates: Record<string, { color?: ColorTag[] } | undefined>,
): ColorTag[] {
  const used = new Set<ColorTag>();
  for (const state of Object.values(photoStates)) {
    for (const color of state?.color ?? []) used.add(color);
  }
  return [...used];
}
