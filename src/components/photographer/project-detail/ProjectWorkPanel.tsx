import { ChevronRight, Flag, ListChecks, PenLine, Upload } from "lucide-react";
import type { Project, ProjectStatus } from "@/types";

type WorkMode =
  | "upload-start"
  | "upload-manage"
  | "selection"
  | "retouch"
  | "review"
  | "complete";

type Props = {
  project: Project;
  deadlineDisplay: string;
  reviewDeadlineDisplay: string | null;
  onUpload: () => void;
  onSelection: () => void;
  onWorkflow: () => void;
  onResults: () => void;
};

type WorkPanelContent = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ReactNode;
  onClick: () => void;
  meta: Array<{ label: string; value: string }>;
};

function getWorkMode(status: ProjectStatus, photoCount: number): WorkMode {
  if (status === "preparing") return photoCount === 0 ? "upload-start" : "upload-manage";
  if (status === "selecting") return "selection";
  if (["confirmed", "editing", "editing_v2"].includes(status)) return "retouch";
  if (["reviewing_v1", "reviewing_v2"].includes(status)) return "review";
  return "complete";
}

/**
 * 프로젝트 상태를 6개 작업 모드로 묶어 표현한다.
 * 상태 값과 기존 라우팅은 바꾸지 않고, 안내 문구·CTA만 이 컴포넌트에서 결정한다.
 */
export function ProjectWorkPanel({
  project,
  deadlineDisplay,
  reviewDeadlineDisplay,
  onUpload,
  onSelection,
  onWorkflow,
  onResults,
}: Props) {
  const mode = getWorkMode(project.status, project.photoCount);
  const content: WorkPanelContent = (() => {
    switch (mode) {
      case "upload-start":
        return {
          eyebrow: "다음 단계",
          title: "원본 사진을 업로드하세요",
          description: "고객에게 링크를 보내기 전에 셀렉용 사진을 먼저 준비해야 합니다.",
          cta: "사진 업로드 시작",
          icon: <Upload size={20} />,
          onClick: onUpload,
          meta: [
            { label: "업로드된 사진", value: "0장" },
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
          ],
        };
      case "upload-manage":
        return {
          eyebrow: "다음 단계",
          title:
            project.photoCount >= project.requiredCount
              ? "고객 셀렉을 시작할 준비가 되었습니다"
              : "원본 사진을 계속 업로드하세요",
          description:
            project.photoCount >= project.requiredCount
              ? "업로드 화면에서 사진을 더 추가하거나 고객 링크를 활성화할 수 있습니다."
              : `고객 셀렉을 시작하려면 사진을 ${project.requiredCount - project.photoCount}장 이상 더 준비하세요.`,
          cta: "업로드 현황 보기",
          icon: <Upload size={20} />,
          onClick: onUpload,
          meta: [
            { label: "업로드된 사진", value: `${project.photoCount}장` },
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
          ],
        };
      case "selection":
        return {
          eyebrow: "현재 진행",
          title: "고객이 사진을 선택하고 있습니다",
          description: "고객이 최종 선택을 완료하면 셀렉 결과와 코멘트를 확인할 수 있습니다.",
          cta: "셀렉 결과 화면 보기",
          icon: <ListChecks size={20} />,
          onClick: onSelection,
          meta: [
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
            { label: "셀렉 마감", value: deadlineDisplay },
          ],
        };
      case "retouch":
        return {
          eyebrow: project.status === "confirmed" ? "다음 단계" : "현재 진행",
          title:
            project.status === "confirmed"
              ? "고객 셀렉이 확정되었습니다"
              : project.status === "editing_v2"
              ? "재보정 v2를 진행하세요"
              : "보정본을 준비하고 있습니다",
          description:
            project.status === "confirmed"
              ? "선택된 사진과 고객 코멘트를 확인하고 보정 작업을 시작하세요."
              : project.status === "editing_v2"
              ? "고객 요청 사항을 반영한 재보정본을 준비하세요."
              : "보정이 끝난 사진을 업로드해 고객 검토를 요청하세요.",
          cta: project.status === "confirmed" ? "보정 작업 시작" : "보정 작업 계속하기",
          icon: <PenLine size={20} />,
          onClick: onWorkflow,
          meta: [
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
            { label: "재보정 허용", value: project.maxRevisionCount === 0 ? "없음" : `최대 ${project.maxRevisionCount}회` },
          ],
        };
      case "review":
        return {
          eyebrow: "현재 진행",
          title: project.status === "reviewing_v2" ? "고객이 재보정본을 검토하고 있습니다" : "고객이 보정본을 검토하고 있습니다",
          description: "고객의 검토 결과와 요청 사항은 보정 작업 화면에서 확인할 수 있습니다.",
          cta: "보정본 현황 보기",
          icon: <ListChecks size={20} />,
          onClick: onWorkflow,
          meta: [
            { label: "검토 기한", value: reviewDeadlineDisplay ?? "미설정" },
            { label: "재보정 허용", value: project.maxRevisionCount === 0 ? "없음" : `최대 ${project.maxRevisionCount}회` },
          ],
        };
      case "complete":
        return {
          eyebrow: "프로젝트 완료",
          title: "사진 납품이 완료되었습니다",
          description: "선택 결과와 고객 코멘트 등 프로젝트 이력을 확인할 수 있습니다.",
          cta: "프로젝트 결과 보기",
          icon: <Flag size={20} />,
          onClick: onResults,
          meta: [
            { label: "업로드된 사진", value: `${project.photoCount}장` },
            { label: "고객 셀렉 목표", value: `${project.requiredCount}장` },
          ],
        };
    }
  })();

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/45 bg-accent/8 p-5 md:p-6">
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-black">
            {content.icon}
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-accent">{content.eyebrow}</p>
            <h2 className="text-lg font-bold tracking-tight text-foreground md:text-xl">{content.title}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{content.description}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {content.meta.map((item) => (
                <div key={item.label} className="flex items-baseline gap-2">
                  <dt className="text-xs text-subtle-foreground">{item.label}</dt>
                  <dd className="text-sm font-semibold text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <button
          type="button"
          onClick={content.onClick}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#ff5e1a]"
        >
          {content.cta}
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
