"use client";

import { BadgeCheck, FolderPlus, ImagePlus, Link2, type LucideIcon } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";

interface FirstProjectOnboardingProps {
  onCreateProject: () => void;
  headingLevel?: "h1" | "h2";
  className?: string;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "원본 사진 올리기",
    description: "고객 정보와 셀렉 가능 수, 마감일을 설정한 뒤 촬영한 원본 사진을 업로드해요.",
    icon: ImagePlus,
  },
  {
    title: "고객에게 링크 보내기",
    description: "생성된 링크와 PIN을 보내면 고객이 가입 없이 사진을 확인하고 원하는 사진을 선택해요.",
    icon: Link2,
  },
  {
    title: "셀렉 확인하고 납품하기",
    description: "확정된 셀렉 사진을 보정해 업로드하고, 고객의 수정 요청과 승인을 거쳐 최종본을 전달해요.",
    icon: BadgeCheck,
  },
];

export function FirstProjectOnboarding({
  onCreateProject,
  headingLevel = "h1",
  className = "",
}: FirstProjectOnboardingProps) {
  const Heading = headingLevel;

  return (
    <div className={`flex w-full max-w-[680px] flex-col items-start gap-14 ${className}`}>
      <section className="flex w-full flex-col items-start gap-8">
        <div className="flex size-[72px] items-center justify-center rounded-xl border border-border-strong bg-surface-raised text-accent">
          <FolderPlus aria-hidden="true" size={32} strokeWidth={1.8} />
        </div>

        <div className="flex flex-col items-start">
          <div className="flex flex-col gap-3">
            <Heading className="text-[28px] font-bold leading-[38px] tracking-[-0.56px] text-foreground md:text-[32px] md:leading-[42px] md:tracking-[-0.64px]">
              첫 프로젝트를 만들어보세요
            </Heading>
            <p className="max-w-[650px] text-[16px] font-normal leading-[1.7] tracking-[-0.4px] text-muted-foreground md:text-[18px] md:leading-[1.8] md:tracking-[-0.45px]">
              사진을 올리고 고객에게 셀렉 링크를 보내면 보정부터 납품까지 한곳에서 관리할 수 있어요
            </p>
          </div>

          <PhotographerLightButton
            type="button"
            onClick={onCreateProject}
            className="mt-6 min-h-[52px] rounded-full px-6 py-3.5 text-[16px] leading-6 tracking-[-0.32px]"
            style={{ borderRadius: 999 }}
          >
            새 프로젝트 만들기
          </PhotographerLightButton>
        </div>
      </section>

      <section
        aria-label="프로젝트 진행 방법"
        className="w-full overflow-hidden rounded-xl border border-border-subtle bg-surface py-5 shadow-[0_2px_6px_rgba(2,56,82,0.03)]"
      >
        {ONBOARDING_STEPS.map((step, index) => {
          const Icon = step.icon;

          return (
            <div key={step.title}>
              {index > 0 ? <div className="h-px bg-border-subtle/60" /> : null}
              <div className="flex min-h-16 items-center gap-5 px-5 sm:gap-6 sm:px-7 sm:pr-6">
                <div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                  <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-6 tracking-[-0.3px] text-foreground sm:text-[16px] sm:tracking-[-0.32px]">
                    {step.title}
                  </h3>
                  <p className="max-w-[560px] text-[12px] font-normal leading-5 tracking-[-0.24px] text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
