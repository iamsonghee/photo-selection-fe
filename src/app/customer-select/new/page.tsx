"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Images, Layers3, Send } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft, type ShootType } from "@/contexts/CustomerSelectDraftContext";
import { SHOOT_TYPES } from "@/lib/customer-select-sample";

const BENEFITS = [
  { icon: Layers3, title: "촬영 흐름대로 확인", body: "사진을 작은 구간으로 나눠 골라요." },
  { icon: Images, title: "유사컷끼리 묶기", body: "비슷한 사진을 모아서 확인해요." },
  { icon: Send, title: "작가에게 전달", body: "파일명과 요청 사항을 함께 보내요." },
];

const INPUT_CLASS = "min-h-12 w-full rounded-lg border border-[var(--customer-divider)] bg-white px-4 text-[16px] text-[var(--customer-ink)] outline-none placeholder:text-[var(--select-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10";

export default function NewCustomerSelectProjectPage() {
  const router = useRouter();
  const { setProject } = useCustomerSelectDraft();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("shootType")) as ShootType;
    const name = String(form.get("projectName") ?? "").trim() || `${SHOOT_TYPES.find(item => item.id === type)?.label ?? "사진"} 셀렉`;
    const rawTarget = String(form.get("targetCount") ?? "").trim();
    setProject(name, type, rawTarget ? Number(rawTarget) : null);
    router.push("/customer-select/upload");
  }

  return (
    <CustomerEntryShell layout="responsive">
      <div className="cs-brand-header relative border-b border-[var(--select-line)]">
        <CustomerEntryHeader href="/" />
        <span className="absolute bottom-[15px] right-6 text-[12px] font-semibold text-[var(--select-muted)]">A-CUT Select</span>
      </div>

      <main className="mx-auto grid w-full max-w-[1040px] gap-10 px-6 py-9 md:grid-cols-[1fr_400px] md:gap-16 md:px-10 md:py-16">
        <section aria-labelledby="select-intro-title" className="md:pt-4">
          <p className="m-0 text-[12px] font-bold text-[var(--accent)]">내 사진은 내가 고르니까</p>
          <h1 id="select-intro-title" className="cs-title mt-3 ">
            수천 장의 사진,
            <br />장면별로 골라보세요.
          </h1>
          <p className="mt-5 text-[14px] leading-6 text-[var(--customer-ink-secondary)] md:text-[16px] md:leading-7">
            AI는 정리만 돕고, 최종 사진은 직접 골라요.
            <br />사진을 삭제하거나 숨기지 않습니다.
          </p>

          <div className="mt-9 hidden divide-y divide-[var(--select-line)] border-y border-[var(--select-line)] md:block">
            {BENEFITS.map(({ icon: Icon, title, body }, index) => (
              <div key={title} className="grid grid-cols-[36px_1fr] gap-3 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--select-accent-soft)] text-[var(--accent)]">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="m-0 text-[12px] font-bold text-[var(--select-muted)]">0{index + 1}</p>
                  <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--customer-ink)]">{title}</h2>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--customer-ink-secondary)]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cs-panel self-start" aria-labelledby="project-form-title">
          <p className="m-0 text-[12px] font-bold text-[var(--accent)]">1단계 · 시작 설정</p>
          <h2 id="project-form-title" className="mt-2 text-[24px] font-semibold leading-9 tracking-[-0.035em] text-[var(--customer-ink)]">어떤 사진을 골라볼까요?</h2>

          <form className="mt-7 flex flex-col gap-6" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-[13px] font-semibold text-[var(--customer-ink-secondary)]">
              프로젝트 이름 <span className="font-normal">· 선택</span>
              <input maxLength={60} name="projectName" placeholder="예: 지우와 민준 본식" className={INPUT_CLASS} />
            </label>

            <label className="flex flex-col gap-2 text-[13px] font-semibold text-[var(--customer-ink-secondary)]">
              어떤 촬영 사진인가요? <span className="sr-only">필수</span>
              <select required name="shootType" defaultValue="" className={INPUT_CLASS}>
                <option value="" disabled>촬영 유형을 선택해 주세요</option>
                {SHOOT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-[13px] font-semibold text-[var(--customer-ink-secondary)]">
              최종 목표 장수 <span className="font-normal">· 선택</span>
              <span className="relative block max-w-[220px]">
                <input type="number" inputMode="numeric" name="targetCount" min={1} max={5000} placeholder="예: 60" className={`${INPUT_CLASS} pr-12 text-right`} />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[14px] font-normal text-[var(--select-muted)]">장</span>
              </span>
              <span className="text-[12px] font-normal leading-5 text-[var(--select-muted)]">정하지 않았다면 비워두세요. 나중에도 자유롭게 고를 수 있어요.</span>
            </label>

            <div className="border-l-2 border-[var(--accent)] bg-[var(--select-surface)] px-4 py-3">
              <p className="m-0 text-[13px] font-semibold text-[var(--customer-ink)]">최대 5,000장 · 원본 파일명 유지</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--customer-ink-secondary)]">선택용 미리보기를 사용해요. 원본은 직접 보관하세요.</p>
            </div>

            <button type="submit" className={`cs-primary`}>사진 올리기</button>
          </form>

          <p className="mt-5 text-center text-[12px] leading-5 text-[var(--select-muted)]">프론트 검수용 · 실제 업로드와 분석은 미연결</p>
        </section>
      </main>
    </CustomerEntryShell>
  );
}
