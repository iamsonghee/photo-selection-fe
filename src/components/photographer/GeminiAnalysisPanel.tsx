"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { Photo } from "@/types";

const MONO = "'Space Mono', 'JetBrains Mono', 'Noto Sans KR', sans-serif";
const TEXT_MUTED = "var(--subtle-foreground)";
const TEXT_NORMAL = "var(--muted-foreground)";
const TEXT_BRIGHT = "var(--foreground)";
/** OpenCLIP 기능(--accent, 주황)과 시각적으로 구분하기 위한 POC 전용 accent(보라) */
const POC_ACCENT = "#8b6bff";
const POC_ACCENT_DIM = "rgba(139, 107, 255, 0.12)";
const BORDER_MID_FALLBACK = "var(--border-strong)";
/** 품질 반영 "AI 추천" 배지 전용 색 — medoid "대표 이미지"(보라)와 구분하기 위한 청록 */
const REC_ACCENT = "#2FB6B0";

type GeminiRunStatus = "processing" | "completed" | "failed" | null;

type GeminiRun = {
  id: string;
  status: GeminiRunStatus;
  image_count: number;
  processed_count: number;
  failed_count: number;
  estimated_cost_usd: number | null;
  duration_ms: number | null;
  similarity_threshold: number;
  requested_image_limit: number | null;
  error: string | null;
};

type GeminiQualityRun = {
  id: string;
  status: GeminiRunStatus;
  image_count: number;
  processed_count: number;
  failed_count: number;
  reused_count: number;
  estimated_cost_usd: number | null;
  duration_ms: number | null;
  requested_image_limit: number | null;
  error: string | null;
};

type QualityLevel = "ok" | "possible" | "likely" | "unknown";

type QualityEntry = {
  gemini: {
    eyes_closed: QualityLevel;
    blur_or_shake: QualityLevel;
    focus_issue: QualityLevel;
    face_occluded: QualityLevel;
    model: string;
    prompt_version: string;
  };
  legacy: {
    is_blurry: boolean | null;
    face_detected: boolean | null;
    eyes_closed: boolean | null;
  };
};

type RecommendationTier = "clean" | "minor" | "unknown" | "major" | "unavailable";

type GeminiGroup = {
  photo_ids: string[];
  representative_photo_id: string;
  recommended_photo_id: string;
  recommendation_tier: RecommendationTier;
  recommendation_reason: string | null;
  photo_count: number;
  avg_similarity: number;
  quality_by_photo: Record<string, QualityEntry>;
};

const AXES = ["eyes_closed", "blur_or_shake", "focus_issue", "face_occluded"] as const;
const AXIS_LABEL_KO: Record<(typeof AXES)[number], string> = {
  eyes_closed: "눈 감음",
  blur_or_shake: "흔들림",
  focus_issue: "초점",
  face_occluded: "얼굴 판정",
};
const LEVEL_LABEL_KO: Record<QualityLevel, string> = {
  ok: "문제 없음",
  possible: "가능성 있음",
  likely: "의심",
  unknown: "판정 어려움",
};

/** 그룹 썸네일에 붙일 품질 요약 배지 — 가장 심각한 축 하나만 표시(복잡도를 낮추기 위함),
 * 상세 비교는 title 툴팁으로 제공한다. "판정"이 아니라 "의심/확인 필요"로만 표현한다. */
function summarizeQuality(q: QualityEntry | undefined): { label: string; color: string } | null {
  if (!q) return { label: "미분석", color: TEXT_MUTED };
  const rank: Record<QualityLevel, number> = { ok: 0, unknown: 0, possible: 1, likely: 2 };
  let worstAxis: (typeof AXES)[number] | null = null;
  let worstLevel: QualityLevel = "ok";
  for (const axis of AXES) {
    const level = q.gemini[axis];
    if (rank[level] > rank[worstLevel]) {
      worstLevel = level;
      worstAxis = axis;
    }
  }
  if (worstLevel === "ok") {
    const hasUnknown = AXES.some((a) => q.gemini[a] === "unknown");
    return hasUnknown ? { label: "일부 확인 어려움", color: TEXT_MUTED } : { label: "이상 없음", color: "#4CAF7D" };
  }
  const suffix = worstLevel === "likely" ? "의심" : "가능성";
  return {
    label: `${AXIS_LABEL_KO[worstAxis as (typeof AXES)[number]]} ${suffix}`,
    color: worstLevel === "likely" ? "#FF6B6B" : "#FFB800",
  };
}

/** 유사컷 그룹 소속 여부와 무관하게 프로젝트 전체 사진 1장의 품질 판정 — /overview 응답 형태.
 * gemini가 null이면 아직 분석되지 않은 사진(미분석)이다. */
type OverviewPhoto = {
  photo_id: string;
  gemini: QualityEntry["gemini"] | null;
  legacy: QualityEntry["legacy"];
  has_signal: boolean;
};

type QualityFilterKey = "all" | (typeof AXES)[number] | "unanalyzed";

const QUALITY_FILTERS: { key: QualityFilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "eyes_closed", label: "눈 감음 의심" },
  { key: "blur_or_shake", label: "흔들림 의심" },
  { key: "focus_issue", label: "초점 확인 필요" },
  { key: "face_occluded", label: "얼굴 판정 어려움" },
  { key: "unanalyzed", label: "품질 분석 실패·미분석" },
];

/** 향후 베타 지표 연동을 위한 훅 지점. 지금은 콘솔 로그만 남긴다 — 실제 분석 파이프라인
 * 연동(예: project_logs 또는 신규 analytics 테이블 기록)은 별도 결정이 필요해 구조만 마련해둔다. */
function logQualityInteraction(event: string, detail?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[gemini-quality-interaction]", event, detail);
  }
}

function qualityTooltip(q: QualityEntry): string {
  const geminiLines = AXES.map((axis) => `${AXIS_LABEL_KO[axis]}: ${LEVEL_LABEL_KO[q.gemini[axis]]}`);
  const legacyBlur =
    q.legacy.is_blurry === true ? "의심" : q.legacy.is_blurry === false ? "정상" : "미분석";
  const legacyEyes =
    q.legacy.face_detected === false
      ? "얼굴 미검출"
      : q.legacy.eyes_closed === true
      ? "의심"
      : q.legacy.eyes_closed === false
      ? "정상"
      : "미분석";
  return [
    "[Gemini Flash · 1200px]",
    ...geminiLines,
    "",
    "[기존 OpenCV/MediaPipe · 300px]",
    `흔들림: ${legacyBlur}`,
    `눈 감음: ${legacyEyes}`,
    "",
    "해상도가 달라 직접 비교 시 참고용으로만 확인해주세요.",
  ].join("\n");
}

type Props = {
  projectId: string;
  photos: Photo[];
};

/**
 * Gemini Embedding 유사컷 그룹핑 POC — 기존 OpenCLIP "AI 유사컷 분석"과 완전히 독립된 실험 기능.
 * 결과를 기존 사진 그리드에 섞지 않고 별도 패널로 보여준다(관리자 전용 노출은 호출부에서 제어).
 */
export default function GeminiAnalysisPanel({ projectId, photos }: Props) {
  const [status, setStatus] = useState<GeminiRunStatus>(null);
  const [run, setRun] = useState<GeminiRun | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [imageLimitChoice, setImageLimitChoice] = useState<"50" | "100" | "all">("50");
  const [panelOpen, setPanelOpen] = useState(false);
  const [groups, setGroups] = useState<GeminiGroup[]>([]);
  const [groupsThreshold, setGroupsThreshold] = useState(0.96);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const thresholdSeededRef = useRef(false);

  /** Gemini Flash 품질 판정 — Embedding 분석과 완전히 독립된 상태(별도 트리거/폴링/취소) */
  const [qualityStatus, setQualityStatus] = useState<GeminiRunStatus>(null);
  const [qualityRun, setQualityRun] = useState<GeminiQualityRun | null>(null);
  const [qualityTriggering, setQualityTriggering] = useState(false);

  /** 결과 모달 탭 — "품질 확인"(그룹 소속 무관 전체 사진) / "유사컷 그룹"(medoid 대표+추천) */
  const [activeTab, setActiveTab] = useState<"quality" | "groups">("quality");
  const [qualityOverview, setQualityOverview] = useState<OverviewPhoto[]>([]);
  const [qualityOverviewLoading, setQualityOverviewLoading] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<QualityFilterKey>("all");

  const photoById = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) map.set(p.id, p);
    return map;
  }, [photos]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/photographer/projects/${projectId}/gemini-analysis`);
      if (!res.ok) return;
      const data = (await res.json()) as { gemini_analysis_status?: GeminiRunStatus; run?: GeminiRun };
      setStatus(data.gemini_analysis_status ?? null);
      if (data.run) {
        setRun(data.run);
        if (!thresholdSeededRef.current) {
          setGroupsThreshold(data.run.similarity_threshold);
          thresholdSeededRef.current = true;
        }
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /** 처리 중일 때만 폴링 — 기존 OpenCLIP "AI 유사컷 분석"과 동일 패턴 (새로고침해도 재개됨) */
  useEffect(() => {
    if (status !== "processing") return;
    const t = setInterval(loadStatus, 4000);
    return () => clearInterval(t);
  }, [status, loadStatus]);

  const loadQualityStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/photographer/projects/${projectId}/gemini-quality`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        gemini_quality_status?: GeminiRunStatus;
        run?: GeminiQualityRun;
      };
      setQualityStatus(data.gemini_quality_status ?? null);
      if (data.run) setQualityRun(data.run);
    } catch {}
  }, [projectId]);

  useEffect(() => {
    loadQualityStatus();
  }, [loadQualityStatus]);

  useEffect(() => {
    if (qualityStatus !== "processing") return;
    const t = setInterval(loadQualityStatus, 4000);
    return () => clearInterval(t);
  }, [qualityStatus, loadQualityStatus]);

  const loadGroups = useCallback(
    async (threshold: number) => {
      setGroupsLoading(true);
      try {
        // include_quality=true: 관리자 전용 POC 패널에서만 품질 반영 추천을 명시적으로 요청한다.
        // 베타 사용자 화면(업로드 페이지의 [AI 유사도 분석])은 이 파라미터를 전혀 보내지 않아
        // 기본값(false)으로 품질 데이터가 대표 이미지 선정에 섞이지 않는다.
        const res = await fetch(
          `/api/photographer/projects/${projectId}/gemini-analysis/groups?threshold=${threshold}&include_quality=true`
        );
        if (res.ok) {
          const data = (await res.json()) as { groups?: GeminiGroup[] };
          setGroups(data.groups ?? []);
        }
      } catch {
      } finally {
        setGroupsLoading(false);
      }
    },
    [projectId]
  );

  /** threshold 변경 시 짧은 디바운스로 재계산 — Gemini API 재호출 없이 저장된 임베딩만 사용하므로 추가 비용 없음 */
  useEffect(() => {
    if (!panelOpen || status !== "completed") return;
    const t = setTimeout(() => loadGroups(groupsThreshold), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsThreshold, panelOpen, status]);

  /** 유사컷 그룹 소속 여부와 무관한 프로젝트 전체 사진의 품질 판정 — 저장된 결과만 조회하므로
   * Gemini API를 다시 호출하지 않는다. 아직 분석 전이어도 호출 자체는 안전(전부 미분석으로 응답). */
  const loadQualityOverview = useCallback(async () => {
    setQualityOverviewLoading(true);
    try {
      const res = await fetch(`/api/photographer/projects/${projectId}/gemini-quality/overview`);
      if (res.ok) {
        const data = (await res.json()) as { photos?: OverviewPhoto[] };
        setQualityOverview(data.photos ?? []);
      }
    } catch {
    } finally {
      setQualityOverviewLoading(false);
    }
  }, [projectId]);

  /** 모달이 열려 있고 "품질 확인" 탭일 때 로드 — 탭 전환/최초 오픈 모두 이 한 곳에서 처리 */
  useEffect(() => {
    if (!panelOpen || activeTab !== "quality") return;
    loadQualityOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, activeTab]);

  const qualityCounts = useMemo(() => {
    const counts: Record<QualityFilterKey, number> = {
      all: qualityOverview.length,
      eyes_closed: 0,
      blur_or_shake: 0,
      focus_issue: 0,
      face_occluded: 0,
      unanalyzed: 0,
    };
    for (const p of qualityOverview) {
      if (!p.has_signal || !p.gemini) {
        counts.unanalyzed += 1;
        continue;
      }
      for (const axis of AXES) {
        if (p.gemini[axis] === "possible" || p.gemini[axis] === "likely") counts[axis] += 1;
      }
    }
    return counts;
  }, [qualityOverview]);

  const filteredQualityPhotos = useMemo(() => {
    if (qualityFilter === "all") return qualityOverview;
    if (qualityFilter === "unanalyzed") return qualityOverview.filter((p) => !p.has_signal || !p.gemini);
    return qualityOverview.filter(
      (p) => p.has_signal && p.gemini && (p.gemini[qualityFilter] === "possible" || p.gemini[qualityFilter] === "likely")
    );
  }, [qualityOverview, qualityFilter]);

  const handleStart = useCallback(async () => {
    if (triggering || status === "processing") return;
    setTriggering(true);
    try {
      const limit = imageLimitChoice === "all" ? undefined : Number(imageLimitChoice);
      const res = await fetch(`/api/photographer/projects/${projectId}/gemini-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      if (res.ok) setStatus("processing");
    } catch {
    } finally {
      setTriggering(false);
    }
  }, [projectId, imageLimitChoice, triggering, status]);

  const handleCancel = useCallback(async () => {
    if (triggering) return;
    setTriggering(true);
    try {
      await fetch(`/api/photographer/projects/${projectId}/gemini-analysis`, { method: "DELETE" });
      await loadStatus();
    } catch {
    } finally {
      setTriggering(false);
    }
  }, [projectId, triggering, loadStatus]);

  const handleStartQuality = useCallback(async () => {
    if (qualityTriggering || qualityStatus === "processing") return;
    setQualityTriggering(true);
    try {
      const limit = imageLimitChoice === "all" ? undefined : Number(imageLimitChoice);
      const res = await fetch(`/api/photographer/projects/${projectId}/gemini-quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      if (res.ok) setQualityStatus("processing");
    } catch {
    } finally {
      setQualityTriggering(false);
    }
  }, [projectId, imageLimitChoice, qualityTriggering, qualityStatus]);

  const handleCancelQuality = useCallback(async () => {
    if (qualityTriggering) return;
    setQualityTriggering(true);
    try {
      await fetch(`/api/photographer/projects/${projectId}/gemini-quality`, { method: "DELETE" });
      await loadQualityStatus();
    } catch {
    } finally {
      setQualityTriggering(false);
    }
  }, [projectId, qualityTriggering, loadQualityStatus]);

  const handleOpenResults = useCallback(() => {
    setPanelOpen(true);
    if (status === "completed" || qualityStatus === "completed") loadGroups(groupsThreshold);
  }, [status, qualityStatus, groupsThreshold, loadGroups]);

  const statusLabel =
    status === "processing"
      ? "분석 중…"
      : status === "completed"
      ? "분석 완료"
      : status === "failed"
      ? "분석 실패"
      : "미실행";

  return (
    <>
      <div
        className="prj-gemini-poc-bar"
        style={{
          flexShrink: 0,
          background: "rgba(8, 4, 2, 0.96)",
          borderTop: `1px solid ${POC_ACCENT_DIM}`,
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_BRIGHT }}>
              Gemini 분석
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: POC_ACCENT,
                border: `1px solid ${POC_ACCENT}`,
                borderRadius: 4,
                padding: "1px 6px",
                fontFamily: MONO,
              }}
            >
              POC
            </span>
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED }}>
            {status === "processing"
              ? "분석 중… 잠시 후 완료됩니다 (관리자 전용 실험 기능)"
              : status === "completed" && run
              ? `${statusLabel} · 처리 ${run.processed_count}장 · 실패 ${run.failed_count}장 · 예상비용 $${(
                  run.estimated_cost_usd ?? 0
                ).toFixed(4)}`
              : status === "failed"
              ? `분석 실패: ${run?.error ?? "다시 시도해주세요"}`
              : "Gemini 임베딩으로 유사컷 그룹핑을 실험합니다 (OpenCLIP 결과와 별개)"}
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED }}>
            {qualityStatus === "processing"
              ? "이미지 품질 확인 중… (관리자 전용 실험 기능)"
              : qualityStatus === "completed" && qualityRun
              ? `품질 확인 완료 · 처리 ${qualityRun.processed_count}장 · 재사용 ${qualityRun.reused_count}장 · 실패 ${qualityRun.failed_count}장 · 예상비용 $${(
                  qualityRun.estimated_cost_usd ?? 0
                ).toFixed(4)}`
              : qualityStatus === "failed"
              ? `품질 확인 실패: ${qualityRun?.error ?? "다시 시도해주세요"}`
              : "Gemini Flash로 눈감음·흔들림·초점을 1차 확인합니다 (자동 삭제·숨김 아님)"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status !== "processing" && (
            <select
              value={imageLimitChoice}
              onChange={(e) => setImageLimitChoice(e.target.value as "50" | "100" | "all")}
              disabled={triggering}
              style={{
                background: "transparent",
                border: `1px solid ${BORDER_MID_FALLBACK}`,
                borderRadius: 8,
                color: TEXT_NORMAL,
                fontSize: 12,
                fontFamily: MONO,
                padding: "7px 8px",
              }}
            >
              <option value="50">50장</option>
              <option value="100">100장</option>
              <option value="all">전체</option>
            </select>
          )}

          {status === "processing" ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={triggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid rgba(255,80,80,0.4)",
                borderRadius: 8,
                color: "rgba(255,100,100,0.9)",
                fontSize: 12, fontWeight: 500,
                cursor: triggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: triggering ? 0.6 : 1,
              }}
            >
              <X size={14} />
              분석 중단
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={triggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: `1px solid ${POC_ACCENT}`,
                borderRadius: 8,
                color: POC_ACCENT,
                fontSize: 12, fontWeight: 500,
                cursor: triggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: triggering ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} />
              {status === "completed" ? "Gemini 재분석 (POC)" : "Gemini 분석 (POC)"}
            </button>
          )}

          {qualityStatus === "processing" ? (
            <button
              type="button"
              onClick={handleCancelQuality}
              disabled={qualityTriggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid rgba(255,80,80,0.4)",
                borderRadius: 8,
                color: "rgba(255,100,100,0.9)",
                fontSize: 12, fontWeight: 500,
                cursor: qualityTriggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: qualityTriggering ? 0.6 : 1,
              }}
            >
              <X size={14} />
              확인 중단
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartQuality}
              disabled={qualityTriggering}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px",
                background: "transparent",
                border: `1px solid ${BORDER_MID_FALLBACK}`,
                borderRadius: 8,
                color: TEXT_NORMAL,
                fontSize: 12, fontWeight: 500,
                cursor: qualityTriggering ? "not-allowed" : "pointer",
                fontFamily: MONO,
                opacity: qualityTriggering ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} />
              {qualityStatus === "completed" ? "품질 재확인 (POC)" : "이미지 품질 확인 (POC)"}
            </button>
          )}

          {((status === "completed" || status === "failed") && run) ||
          ((qualityStatus === "completed" || qualityStatus === "failed") && qualityRun) ? (
            <button
              type="button"
              onClick={handleOpenResults}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: `1px solid ${BORDER_MID_FALLBACK}`,
                borderRadius: 8,
                color: TEXT_NORMAL,
                fontSize: 12, fontWeight: 500,
                cursor: "pointer",
                fontFamily: MONO,
              }}
            >
              결과 보기
            </button>
          ) : null}
        </div>
      </div>

      {panelOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setPanelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, 100%)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              background: "#0d0806",
              border: `1px solid ${POC_ACCENT_DIM}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: `1px solid ${BORDER_MID_FALLBACK}`,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_BRIGHT }}>
                  Gemini 분석 결과 (POC)
                </div>
                {run && (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                    임베딩: 분석 {run.image_count}장 · 처리 {run.processed_count}장 · 실패 {run.failed_count}장
                    {run.duration_ms != null ? ` · ${(run.duration_ms / 1000).toFixed(1)}초` : ""}
                    {" · 예상비용 $"}
                    {(run.estimated_cost_usd ?? 0).toFixed(4)}
                  </div>
                )}
                {qualityRun && (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                    품질확인: 분석 {qualityRun.image_count}장 · 처리 {qualityRun.processed_count}장 · 재사용{" "}
                    {qualityRun.reused_count}장 · 실패 {qualityRun.failed_count}장
                    {qualityRun.duration_ms != null ? ` · ${(qualityRun.duration_ms / 1000).toFixed(1)}초` : ""}
                    {" · 예상비용 $"}
                    {(qualityRun.estimated_cost_usd ?? 0).toFixed(4)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                style={{ background: "transparent", border: "none", color: TEXT_MUTED, cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: "flex", gap: 4, padding: "10px 20px 0",
                borderBottom: `1px solid ${BORDER_MID_FALLBACK}`,
              }}
            >
              {(["quality", "groups"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "8px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: activeTab === tab ? `2px solid ${POC_ACCENT}` : "2px solid transparent",
                    color: activeTab === tab ? TEXT_BRIGHT : TEXT_MUTED,
                    fontSize: 12, fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: MONO,
                  }}
                >
                  {tab === "quality" ? "품질 확인" : "유사컷 그룹"}
                </button>
              ))}
            </div>

            {activeTab === "groups" && (
            <>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER_MID_FALLBACK}` }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: TEXT_NORMAL }}>
                <span style={{ fontFamily: MONO, minWidth: 110 }}>
                  threshold: {groupsThreshold.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={groupsThreshold}
                  onChange={(e) => setGroupsThreshold(Number(e.target.value))}
                  style={{ flex: 1, accentColor: POC_ACCENT }}
                />
                <span style={{ fontSize: 10, color: TEXT_MUTED, minWidth: 90, textAlign: "right" }}>
                  {groupsLoading ? "재계산 중…" : `${groups.length}개 그룹`}
                </span>
              </label>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>
                threshold 조정은 Gemini API를 다시 호출하지 않고 저장된 임베딩으로만 재계산합니다(추가 비용 없음).
              </div>
            </div>

            <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
              {groups.length === 0 ? (
                <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: "center", padding: "24px 0" }}>
                  {groupsLoading ? "불러오는 중…" : "현재 threshold에서 발견된 유사컷 그룹이 없습니다."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {groups.map((g, gi) => {
                    const orderedIds = [
                      g.recommended_photo_id,
                      ...g.photo_ids.filter((id) => id !== g.recommended_photo_id),
                    ];
                    return (
                      <div key={gi}>
                        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontFamily: MONO }}>
                          그룹 {gi + 1} · {g.photo_count}장 · 평균 유사도 {g.avg_similarity.toFixed(3)}
                        </div>
                        {g.recommendation_reason && (
                          <div style={{ fontSize: 11, color: REC_ACCENT, marginBottom: 8 }}>
                            {g.recommendation_reason}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {orderedIds.map((pid) => {
                            const p = photoById.get(pid);
                            if (!p) return null;
                            const isRep = pid === g.representative_photo_id;
                            const isRec = pid === g.recommended_photo_id;
                            const quality = g.quality_by_photo[pid];
                            const qualitySummary = isRec || quality ? summarizeQuality(quality) : null;
                            const badgeLabel = isRep && isRec ? "대표 · AI 추천" : isRec ? "AI 추천" : isRep ? "대표 이미지" : null;
                            const badgeColor = isRec ? REC_ACCENT : POC_ACCENT;
                            return (
                              <div key={pid} style={{ display: "flex", flexDirection: "column", gap: 3, width: 84 }}>
                                <div
                                  title={
                                    isRec
                                      ? "그룹 내에서 품질 이슈가 적고 대표성이 높은 이미지로 AI가 추천했습니다."
                                      : isRep
                                      ? "그룹 내 사진들과 가장 유사한 이미지를 자동 선택했습니다."
                                      : undefined
                                  }
                                  style={{
                                    width: 84, height: 84, borderRadius: 6, overflow: "hidden",
                                    border: badgeLabel ? `2px solid ${badgeColor}` : `1px solid ${BORDER_MID_FALLBACK}`,
                                    position: "relative", flexShrink: 0,
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.url}
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                  {badgeLabel && (
                                    <span
                                      style={{
                                        position: "absolute", bottom: 0, left: 0, right: 0,
                                        fontSize: 9, fontWeight: 600, color: "#fff",
                                        background: badgeColor,
                                        padding: "2px 4px", textAlign: "center",
                                        fontFamily: MONO,
                                      }}
                                    >
                                      {badgeLabel}
                                    </span>
                                  )}
                                </div>
                                {qualitySummary && (
                                  <span
                                    title={quality ? qualityTooltip(quality) : "Gemini 품질 분석이 아직 없습니다."}
                                    style={{
                                      fontSize: 9, color: qualitySummary.color, textAlign: "center",
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}
                                  >
                                    {qualitySummary.label}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
            )}

            {activeTab === "quality" && (
              <>
                <div
                  style={{
                    padding: "12px 20px", borderBottom: `1px solid ${BORDER_MID_FALLBACK}`,
                    display: "flex", gap: 8, flexWrap: "wrap",
                  }}
                >
                  {QUALITY_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setQualityFilter(f.key);
                        logQualityInteraction("filter_select", { filter: f.key });
                      }}
                      style={{
                        padding: "6px 10px",
                        background: qualityFilter === f.key ? POC_ACCENT_DIM : "transparent",
                        border: `1px solid ${qualityFilter === f.key ? POC_ACCENT : BORDER_MID_FALLBACK}`,
                        borderRadius: 999,
                        color: qualityFilter === f.key ? TEXT_BRIGHT : TEXT_NORMAL,
                        fontSize: 11, fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: MONO,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.label} ({qualityCounts[f.key]})
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: TEXT_MUTED, padding: "8px 20px 0" }}>
                  유사컷 그룹 소속 여부와 무관하게 Flash가 분석한 전체 사진을 대상으로 합니다. 자동 삭제·제외가
                  아니라 검토 후보 표시이며, 저장된 결과만 조회하므로 Gemini API를 다시 호출하지 않습니다.
                </div>

                <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
                  {qualityOverviewLoading && qualityOverview.length === 0 ? (
                    <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: "center", padding: "24px 0" }}>
                      불러오는 중…
                    </div>
                  ) : filteredQualityPhotos.length === 0 ? (
                    <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: "center", padding: "24px 0" }}>
                      해당하는 사진이 없습니다.
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {filteredQualityPhotos.map((op) => {
                        const p = photoById.get(op.photo_id);
                        if (!p) return null;
                        const asEntry: QualityEntry | undefined = op.gemini
                          ? { gemini: op.gemini, legacy: op.legacy }
                          : undefined;
                        const summary = summarizeQuality(asEntry);
                        return (
                          <div
                            key={op.photo_id}
                            style={{ display: "flex", flexDirection: "column", gap: 3, width: 84 }}
                          >
                            <div
                              onClick={() => {
                                logQualityInteraction("photo_open", { photoId: op.photo_id });
                                window.open(p.url, "_blank", "noopener,noreferrer");
                              }}
                              title={asEntry ? qualityTooltip(asEntry) : "Gemini 품질 분석이 아직 없습니다."}
                              style={{
                                width: 84, height: 84, borderRadius: 6, overflow: "hidden",
                                border: `1px solid ${BORDER_MID_FALLBACK}`,
                                cursor: "pointer", flexShrink: 0,
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.url}
                                alt=""
                                loading="lazy"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                            {summary && (
                              <span
                                style={{
                                  fontSize: 9, color: summary.color, textAlign: "center",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}
                              >
                                {summary.label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
