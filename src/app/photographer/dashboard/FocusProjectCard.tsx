"use client";

import { useRouter } from "next/navigation";
import { Bell, Upload, Users, RotateCcw } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type { Project } from "@/types";
import { getActiveDeadline } from "@/lib/project-deadline";
import { dday, getProjectActor } from "@/lib/project-actor";
import { ProjectIdText } from "@/components/photographer/ProjectIdText";
import styles from "./FocusProjectCard.module.css";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";

type FocusStat = { label: string; value: string; sub?: string; critical?: boolean };

/**
 * Headline Accent — 텍스트 전체를 칠하지 않고, Headline 앞의 작은 Icon 색으로만 "무슨 상황인지"를
 * 표현한다. 새 색상을 추가하지 않고 기존 semantic 역할만 재사용한다:
 *   danger   = Deep Red(--danger)      — Critical/Overdue/긴급
 *   action   = Orange(--accent)        — 지금 작가가 해야 할 행동
 *   customer = Porcelain(--cyan)       — 고객(Customer) 관련 상태 전반(배지뿐 아니라 headline에도 확장)
 */
type HeadlineAccent = "danger" | "action" | "customer";

const ACCENT_COLOR: Record<HeadlineAccent, string> = {
  danger: "var(--danger)",
  action: "var(--accent)",
  customer: "var(--cyan)",
};

type IconComponent = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * Focus Project 1건의 Headline/Description/Metric(2개 고정)/Follow-up/CTA — Golden Reference는
 * "Customer Turn + 마감 초과" 1개 예시만 확정해뒀고, 그 외 tier는 실제 필드로만 구성한 신규 카피다.
 * Headline은 "상태"를 먼저 말하고(예: 고객의 셀렉이 지연되고 있어요), 실제 행동 제안은 하단
 * Follow-up Question(예: 고객에게 셀렉 안내를 다시 보내볼까요?)에서 한다 — 둘을 같은 문장으로 섞지 않는다.
 * 재보정 진행률처럼 실제 데이터가 없는 값은 만들지 않고, 항상 2개를 채워야 하는 Metric 자리는 실제로
 * 존재하는 다른 필드(확정일/촬영일/재보정 회차 등)로 대체한다 — 절대 예시 수치를 하드코딩하지 않는다.
 */
function buildFocusContent(project: Project): {
  headline: string;
  headlineAccent: HeadlineAccent;
  headlineIcon: IconComponent;
  description: string | null;
  stats: [FocusStat, FocusStat];
  followUp: string;
  primaryLabel: string;
} {
  const actor = getProjectActor(project.status);
  const deadlineInfo = getActiveDeadline(project);
  const ddayResult = deadlineInfo ? dday(deadlineInfo.date) : null;

  if (actor === "customer" && ddayResult?.level === "danger") {
    const days = ddayResult.text.startsWith("D+") ? ddayResult.text.slice(2) : "0";
    const deadlineDate = formatDate(deadlineInfo!.date);
    if (project.status === "selecting") {
      return {
        headline: "고객의 셀렉이 지연되고 있어요",
        headlineAccent: "danger",
        headlineIcon: Bell,
        description: `원본 ${project.photoCount.toLocaleString()}장 중 ${project.requiredCount.toLocaleString()}장만 셀렉 완료된 상태로 마감일이 ${days}일 지났습니다.`,
        stats: [
          { label: "셀렉 마감일", value: ddayResult.text, sub: deadlineDate, critical: true },
          { label: "셀렉 요청", value: `${project.requiredCount.toLocaleString()}장`, sub: `원본 ${project.photoCount.toLocaleString()}장` },
        ],
        followUp: "고객에게 셀렉 안내를 다시 보내볼까요?",
        primaryLabel: "알림톡 다시 보내기",
      };
    }
    // reviewing_v1 / reviewing_v2 — 검토 마감 초과. 검토 진행률(몇 장 확인했는지)은 목록 레벨
    // 데이터가 없어(Data Gap) 지연 일수 + 마감일 2개만 실제 데이터로 채운다.
    return {
      headline: "고객의 검토가 지연되고 있어요",
      headlineAccent: "danger",
      headlineIcon: Bell,
      description: "고객 확인이 필요한 보정본이 있는 상태로 검토 마감일이 지났습니다.",
      stats: [
        { label: "지연", value: `${days}일`, critical: true },
        { label: "검토 마감일", value: ddayResult.text, sub: deadlineDate, critical: true },
      ],
      followUp: "고객에게 검토 안내를 다시 보내볼까요?",
      primaryLabel: "알림톡 다시 보내기",
    };
  }

  if (project.status === "confirmed" || project.status === "editing") {
    const daysSinceConfirm = project.confirmedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(project.confirmedAt).getTime()) / 86_400_000))
      : null;
    const firstStat: FocusStat = daysSinceConfirm !== null
      ? { label: "확정 경과", value: `${daysSinceConfirm}일`, sub: project.confirmedAt ? formatDate(project.confirmedAt) : undefined }
      : { label: "촬영일", value: formatDate(project.shootDate) };
    const isConfirmed = project.status === "confirmed";
    return {
      headline: isConfirmed ? "고객이 사진 확정을 완료했어요" : "보정본 업로드가 필요해요",
      // confirmed: 고객이 방금 한 일을 설명하는 headline → Customer(Porcelain). editing: 지금
      // 작가가 해야 할 일을 설명하는 headline → Action(Orange). 같은 tier 묶음이어도 문장의 주어가
      // 다르면 accent도 다르게 — "누구의 상태인지"를 색으로 즉시 구분하기 위함.
      headlineAccent: isConfirmed ? "customer" : "action",
      headlineIcon: isConfirmed ? Users : Upload,
      description: `확정된 사진 ${project.requiredCount.toLocaleString()}장의 보정을 ${isConfirmed ? "시작해" : "마무리해"} 주세요.`,
      stats: [firstStat, { label: "보정 대상", value: `${project.requiredCount.toLocaleString()}장` }],
      followUp: isConfirmed ? "지금 보정을 시작할까요?" : "보정본을 업로드할까요?",
      primaryLabel: isConfirmed ? "보정 시작하기" : "보정본 업로드하기",
    };
  }

  if (project.status === "editing_v2") {
    const round = project.revisionRound === 2 ? "2차" : "1차";
    return {
      headline: `${round} 재보정 요청이 도착했어요`,
      // 재보정 요청 자체는 고객이 남겼지만, 지금 헤드라인이 강조하는 것은 "작가가 처리해야 할 일"
      // 이므로 Action(Orange) — 이 메시지에서 사용자가 준 예시("재보정 요청 → Orange")를 그대로 따른다.
      headlineAccent: "action",
      headlineIcon: RotateCcw,
      description: `${round} 재보정 대상 ${project.requiredCount.toLocaleString()}장을 확인하고 반영해 주세요.`,
      stats: [
        { label: "재보정 회차", value: round },
        { label: "재보정 대상", value: `${project.requiredCount.toLocaleString()}장` },
      ],
      followUp: "고객의 재보정 요청을 확인할까요?",
      primaryLabel: "수정 요청 확인하기",
    };
  }

  // preparing
  return {
    headline: "사진 업로드가 필요해요",
    headlineAccent: "action",
    headlineIcon: Upload,
    description: `원본 ${project.photoCount.toLocaleString()}장이 업로드된 상태입니다. 나머지 사진을 업로드해 주세요.`,
    stats: [
      { label: "셀렉 / 원본", value: `${project.requiredCount.toLocaleString()}/${project.photoCount.toLocaleString()}장` },
      { label: "촬영일", value: formatDate(project.shootDate) },
    ],
    followUp: "사진을 업로드할까요?",
    primaryLabel: "사진 업로드하기",
  };
}

// Figma #56043 실측: "10 장"처럼 값 끝에 한글 단위가 붙는 경우, 숫자(36px Bold)와 한글 단위
// (18px SemiBold, 절반 크기+한 단계 가벼운 굵기)를 서로 다른 스타일로 분리해서 보여준다.
// "D+26"처럼 한글 단위가 없는 값은 분리하지 않고 그대로 한 스타일로 렌더링(Figma의 D+2 예시와
// 동일). 값 문자열 끝의 연속된 한글만 unit으로 분리하고, 나머지(숫자/기호/영문)는 main으로 둔다.
function splitValueUnit(value: string): { main: string; unit: string } {
  const match = value.match(/^(.*?)([가-힣]+)$/);
  return match ? { main: match[1], unit: match[2] } : { main: value, unit: "" };
}

function MetricValue({ stat }: { stat: FocusStat }) {
  const { main, unit } = splitValueUnit(stat.value);
  // Figma #56043 실측: 주요 Metric 숫자 ≈36px(Desktop). 날짜(2026.07.27.)처럼 긴 값은 박스 안에서
  // 그대로 두면 줄바꿈이 생기므로, main(숫자/기호) 길이 기준으로 폰트 크기를 단계적으로 낮춰
  // 항상 한 줄에 들어오게 하는 기존 adaptive 로직은 유지하되 Desktop 상한을 26px→36px로 올린다.
  // 한글 단위(unit)는 항상 main의 절반 크기(Figma 36→18px 비율 그대로)로 맞춘다.
  const mainSize = main.length > 9
    ? "text-[16px] lg:text-[22px]"
    : main.length > 6
    ? "text-[20px] lg:text-[28px]"
    : "text-[26px] lg:text-[36px]";
  const unitSize = main.length > 9
    ? "text-[8px] lg:text-[11px]"
    : main.length > 6
    ? "text-[10px] lg:text-[14px]"
    : "text-[13px] lg:text-[18px]";
  return (
    // Figma 확인 결과 두 Metric은 박스 2개가 아니라 하나의 공유 컨테이너 안에 세로 구분선으로
    // 나뉜 형태다 — 이 컴포넌트는 이제 테두리/배경 없이 순수 콘텐츠(라벨/값/서브값)만 담당하고,
    // 공유 컨테이너는 아래 MetricPair가 그린다.
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center gap-1 px-3 py-3.5 tracking-[-0.45px]">
      {/* Label — Figma 14px SemiBold(현재 11.5px에서 정정) */}
      <span className="text-[14px] font-semibold leading-[24px] text-muted-foreground">{stat.label}</span>
      {/* Value — Figma는 숫자 Bold(700)인데 기존 extrabold(800)로 더 굵게 나오고 있었다 → font-bold로 정정.
          한글 단위가 있으면 절반 크기+SemiBold로 분리, 없으면 main 하나만 렌더링(D+26 등). */}
      <span
        className="leading-none whitespace-nowrap"
        style={{ color: stat.critical ? "var(--danger)" : "var(--foreground)" }}
      >
        <span className={`${mainSize} font-bold`}>{main}</span>
        {unit && <span className={`${unitSize} font-semibold`}>{unit}</span>}
      </span>
      {/* Sub — Figma 16px Medium(현재 11px Regular에서 정정) */}
      {stat.sub && <span className={`${styles.metricSub} text-[16px] font-medium leading-[24px] text-disabled-foreground`}>{stat.sub}</span>}
    </div>
  );
}

function MetricPair({ stats }: { stats: [FocusStat, FocusStat] }) {
  // Mobile keeps the existing layout. PC container rules place metrics on a second
  // row until the card itself has enough space for image, full headline and metrics.
  return (
    <div className={`${styles.metrics} w-full lg:w-[30%] lg:shrink-0 lg:h-full rounded-xl bg-surface flex items-stretch`}>
      <MetricValue stat={stats[0]} />
      <div className="w-px bg-border-subtle my-4 shrink-0" />
      <MetricValue stat={stats[1]} />
    </div>
  );
}

export function FocusProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const { headline, headlineAccent, headlineIcon: HeadlineIcon, description, stats, followUp, primaryLabel } = buildFocusContent(project);
  const goToProject = () => router.push(`/photographer/projects/${project.id}`);
  const prefetchProject = () => router.prefetch(`/photographer/projects/${project.id}`);

  return (
    <div className={`${styles.root} relative`}>
      {/* Figma #56043 실측: 카드를 상/하 2단으로 분리한다 — 상단(배지/헤드라인/설명/캡션/Metric,
          --background)과 하단(Follow-up 질문+버튼, --surface + 상단 구분선)을
          overflow-hidden으로 감싼 하나의 outer radius 안에 둔다. 색은 Figma Blue를 쓰지 않고
          Dashboard Light Theme의 Neutral surface만 사용한다. */}
      <div className="rounded-2xl border border-border-subtle overflow-hidden">
        {/* 상단 존 — 썸네일은 유지하되(요청), 정사각(1:1) 대신 3:2 가로형으로 변경(사용자 요청) —
            높이는 그대로 두고 폭만 늘림(Desktop 130→195px, Mobile 76→114px). WorkProjectCard의
            썸네일 비율(aspect-[3/2])과도 맞춰 Dashboard 내 카드 간 일관성을 유지한다.
            Mobile(<lg)은 세로로 쌓아 가로 overflow를 막는다(이미지+헤드라인 → 설명/캡션 →
            Metric 2개를 grid-cols-2로). */}
        <div className={`${styles.top} flex flex-col lg:flex-row gap-4 lg:gap-5 p-4 lg:h-[162px]`} style={{ background: "var(--background)" }}>
          <div className={`${styles.imageGroup} flex gap-3 lg:contents`}>
            <div className={`${styles.thumbnail} relative w-[114px] h-[76px] lg:w-[195px] lg:h-[130px] shrink-0 rounded-xl border border-border-subtle overflow-hidden`}>
              {project.thumbnailUrl ? (
                <img
                  src={project.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, var(--surface-raised) 0%, var(--background) 100%)" }}
                >
                  <span className="text-2xl font-black text-disabled-foreground uppercase tracking-widest select-none">
                    {project.name.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            {/* Mobile 전용 — 썸네일 옆에 압축된 Headline만 배치, 자세한 내용은 아래 Content 블록에서 */}
            <div className={`${styles.mobileHeadline} flex-1 min-w-0 flex flex-col justify-center lg:hidden`}>
              <div className="flex items-center gap-1.5">
                <HeadlineIcon size={14} className="shrink-0" style={{ color: ACCENT_COLOR[headlineAccent] }} />
                <h3 className="text-[15px] font-extrabold text-foreground m-0 line-clamp-2">{headline}</h3>
              </div>
            </div>
          </div>

          {/* Content — Headline("무엇을 해야 하는가")이 Project/Customer("어떤 프로젝트인가")보다
              먼저, 더 강하게 보인다. Desktop 전용 Headline은 여기, Mobile은 위 썸네일 옆에 표시. */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className={`${styles.desktopHeadline} hidden lg:flex items-center gap-1.5`}>
              <HeadlineIcon size={16} className="shrink-0" style={{ color: ACCENT_COLOR[headlineAccent] }} />
              <h3 className={`${styles.headline} text-[21px] font-extrabold text-foreground m-0 line-clamp-1`}>{headline}</h3>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 lg:mt-1.5 line-clamp-2">{description}</p>
            )}
            {/* Project Name · Customer Name — Headline/Description보다 낮은 위계의 캡션.
                고객명 = Porcelain(Customer 역할색을 배지뿐 아니라 관련 텍스트 전반에 확장),
                코드는 여전히 Muted(Nebula) — 둘의 중요도를 색으로도 구분한다. */}
            <div className="text-[12.5px] font-semibold truncate mt-2 text-muted-foreground">
              {project.name}
              <span className="mx-1 text-disabled-foreground">·</span>
              <span style={{ color: "var(--customer-foreground, var(--cyan))" }}>{project.customerName || "—"}</span>
              <span className="ml-1 text-subtle-foreground">·</span>
              <ProjectIdText project={project} className="ml-1" />
            </div>
          </div>

          {/* Metric — Figma처럼 하나의 공유 컨테이너 안에 세로 구분선으로 나뉜 형태(MetricPair).
              Desktop은 %폭으로 오른쪽에, Mobile은 카드 전체 폭을 차지해 가로 overflow를 막는다.
              %폭은 이 top-zone row(직계 flex 컨테이너)를 기준으로 계산돼야 하므로, 폭이 없는
              래퍼 div로 한 번 더 감싸지 않고 MetricPair를 행의 직계 자식으로 둔다 — 감쌌더니
              래퍼 자체가 auto-width라 %가 0으로 붕괴해 내부 텍스트가 깨지는 문제가 있었다. */}
          <MetricPair stats={stats} />
        </div>

        {/* 하단 존 — Figma 실측 절대값(follow-up 18px Bold, 버튼 px-36/py-16/text-16px)을 그대로
            가져왔더니 카드의 다른 부분(헤드라인 21px 등)에 비해 하단만 유독 두꺼워 보였다
            (사용자 피드백). Figma 절대값 대신 이 카드 자체의 비율에 맞춰 축소: follow-up
            15px Semibold, 버튼 padding/폰트도 한 단계 낮춤. 색은 그대로 Design System 유지. */}
        <div className={`${styles.footer} border-t border-border-subtle bg-surface px-4 py-4 lg:px-6 lg:py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4`}>
          <div className={`${styles.followUp} min-w-0 text-[15px] font-semibold text-foreground truncate`}>{followUp}</div>
          <div className={`${styles.actions} flex items-center gap-2 lg:gap-3 shrink-0`}>
            <PhotographerLightButton
              variant="secondary"
              onClick={goToProject}
              onMouseEnter={prefetchProject}
              onFocus={prefetchProject}
              className="flex-1 lg:flex-none"
            >
              프로젝트 보기
            </PhotographerLightButton>
            <PhotographerLightButton
              variant="primary"
              onClick={goToProject}
              onMouseEnter={prefetchProject}
              onFocus={prefetchProject}
              className="flex-1 lg:flex-none"
            >
              {primaryLabel}
            </PhotographerLightButton>
          </div>
        </div>
      </div>
    </div>
  );
}
