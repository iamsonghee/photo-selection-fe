"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { getProjectByToken, mockPhotographer, updateProject } from "@/lib/mock-data";
import { loadConfirmedData } from "@/lib/confirmed-storage";
import { Button } from "@/components/ui";

const CUSTOMER_CANCEL_MAX = 3;

export default function ConfirmedPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const project = getProjectByToken(token);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const N = useMemo(() => {
    if (!project) return 0;
    const data = loadConfirmedData(token);
    if (data?.selectedIds?.length != null) return data.selectedIds.length;
    return project.requiredCount;
  }, [project, token]);

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  const M = project.photoCount;
  const cancelCount = project.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const canCancel = remainingCancels > 0;

  const handleConfirmCancel = () => {
    updateProject(project.id, {
      status: "selecting",
      customerCancelCount: cancelCount + 1,
    });
    setCancelModalOpen(false);
    router.push(`/c/${token}/gallery`);
  };

  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : format(new Date(), "yyyy년 M월 d일 HH:mm", { locale: ko });
  const initial = project.name?.trim().charAt(0) ?? "?";

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
      <div className="mx-auto max-w-[540px] px-5 pt-12 pb-20">
        {/* 헤더 */}
        <header className="text-center mb-9">
          <div className="animate-pop mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#2ed573] bg-[#2ed573]/10 text-[32px]">
            ✅
          </div>
          <h1 className="text-[22px] font-bold mb-1.5">셀렉이 완료되었습니다!</h1>
          <p className="text-[13px] text-[#8b90a0]">{confirmedDate}</p>
        </header>

        {/* 선택 요약 */}
        <section className="rounded-2xl border border-[#252830] bg-[#13151a] p-6 mb-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5a5f70] mb-4">
            선택 요약
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-4xl font-bold text-[#2ed573] md:text-5xl">{N}</span>
            <span className="font-mono text-3xl text-[#5a5f70]">/</span>
            <span className="font-mono text-3xl font-bold text-[#5a5f70]">{M}</span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#8b90a0]">
            <span className="text-[#2ed573]">선택한 사진</span>
            <span className="text-[#252830]">|</span>
            <span>전체 사진</span>
          </div>
          <Link
            href={`/c/${token}/locked`}
            className="mt-4 block w-full rounded-xl border border-[#252830] bg-[#1a1d24] py-3 text-center text-[13px] text-[#8b90a0] transition-colors hover:border-[#4f7eff] hover:text-[#4f7eff]"
          >
            🔒 선택한 사진 보기 (읽기 전용)
          </Link>
        </section>

        {/* 다음 진행 과정 */}
        <section className="rounded-2xl border border-[#252830] bg-[#13151a] p-6 mb-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5a5f70] mb-4">
            다음 진행 과정
          </h2>
          <div className="flex flex-col">
            {/* 1. 사진 셀렉 완료 */}
            <div className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-[#2ed573] bg-[#2ed573]/10 text-[15px]">
                  ✅
                </div>
                <div className="my-1 w-0.5 flex-1 min-h-[20px] bg-[#252830]" />
              </div>
              <div className="pb-6 pt-1 flex-1">
                <div className="text-sm font-semibold mb-0.5">사진 셀렉 완료</div>
                <div className="text-xs text-[#8b90a0] leading-relaxed">
                  {N}장의 사진을 최종 확정했습니다
                </div>
                <span className="mt-1.5 inline-block rounded-full bg-[#2ed573]/10 px-2 py-0.5 text-[11px] text-[#2ed573]">
                  완료
                </span>
              </div>
            </div>
            {/* 2. 보정 작업 */}
            <div className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-[#4f7eff] bg-[#4f7eff]/10 text-[15px]">
                  ✏️
                </div>
                <div className="my-1 w-0.5 flex-1 min-h-[20px] bg-[#252830]" />
              </div>
              <div className="pb-6 pt-1 flex-1">
                <div className="text-sm font-semibold mb-0.5">보정 작업</div>
                <div className="text-xs text-[#8b90a0] leading-relaxed">
                  작가님이 선택하신 사진을 보정합니다. 남겨주신 코멘트와 태그를 반영해 작업해 드려요. 예상 기간 5~7일
                </div>
                <span className="mt-1.5 inline-block rounded-full bg-[#4f7eff]/10 px-2 py-0.5 text-[11px] text-[#4f7eff]">
                  진행 중
                </span>
              </div>
            </div>
            {/* 3. 결과물 납품 */}
            <div className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-[#252830] bg-[#1a1d24] text-[15px]">
                  📦
                </div>
                <div className="my-1 w-0.5 flex-1 min-h-[20px] bg-[#252830]" />
              </div>
              <div className="pb-6 pt-1 flex-1">
                <div className="text-sm font-semibold mb-0.5">결과물 납품</div>
                <div className="text-xs text-[#8b90a0] leading-relaxed">
                  보정 완료된 사진을 고해상도로 전달드립니다. 완료 시 카카오톡으로 알려드려요.
                </div>
                <span className="mt-1.5 inline-block rounded-full bg-[#1a1d24] px-2 py-0.5 text-[11px] text-[#5a5f70]">
                  대기 중
                </span>
              </div>
            </div>
            {/* 4. 완료 */}
            <div className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-[#252830] bg-[#1a1d24] text-[15px]">
                  🎉
                </div>
              </div>
              <div className="pb-1 pt-1 flex-1">
                <div className="text-sm font-semibold mb-0.5">완료</div>
                <div className="text-xs text-[#8b90a0] leading-relaxed">
                  모든 작업이 마무리됩니다
                </div>
                <span className="mt-1.5 inline-block rounded-full bg-[#1a1d24] px-2 py-0.5 text-[11px] text-[#5a5f70]">
                  대기 중
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 담당 작가 */}
        <section className="rounded-2xl border border-[#252830] bg-[#13151a] p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5a5f70] mb-4">
            담당 작가
          </h2>
          <div className="flex gap-3.5 items-center">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4f7eff] to-[#7c3aed] text-xl font-bold text-white">
              {initial}
            </div>
            <div>
              <div className="text-base font-bold mb-0.5">{mockPhotographer.name}</div>
              <div className="text-xs text-[#8b90a0] leading-relaxed">
                웨딩 & 포트레이트 전문 · 서울 기반
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-[#252830] bg-[#1a1d24] px-3.5 py-1.5 text-xs text-[#8b90a0]"
            >
              📷 인스타그램
            </button>
            <button
              type="button"
              className="rounded-full border border-[#252830] bg-[#1a1d24] px-3.5 py-1.5 text-xs text-[#8b90a0]"
            >
              🌐 포트폴리오
            </button>
            <button
              type="button"
              className="rounded-full border border-[#252830] bg-[#1a1d24] px-3.5 py-1.5 text-xs text-[#8b90a0]"
            >
              📞 연락하기
            </button>
          </div>
          <div className="mt-4 rounded-xl border-l-4 border-[#4f7eff] bg-[#1a1d24] p-3.5 text-[13px] text-[#8b90a0] leading-relaxed">
            소중한 순간을 함께할 수 있어 영광입니다. 남겨주신 코멘트 꼼꼼히 반영해서 예쁘게 보정해 드릴게요 😊
          </div>

          {/* 확정 취소 */}
          <div className="mt-6 pt-6 border-t border-[#252830]">
            {canCancel ? (
              <>
                <Button
                  variant="outline"
                  className="w-full border-[#252830] text-[#8b90a0] hover:border-[#ff4757] hover:text-[#ff4757]"
                  onClick={() => setCancelModalOpen(true)}
                >
                  확정 취소
                </Button>
              </>
            ) : (
              <p className="text-center text-xs text-[#5a5f70]">
                재선택 횟수를 모두 사용했습니다
              </p>
            )}
          </div>
        </section>
      </div>

      {/* 확정 취소 확인 모달 */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#252830] bg-[#13151a] p-6 shadow-xl">
            <p className="text-center text-[#e8eaf0]">
              확정을 취소하고 다시 선택하시겠습니까? (남은 횟수 {remainingCancels}/{CUSTOMER_CANCEL_MAX})
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCancelModalOpen(false)}
              >
                아니오
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleConfirmCancel}>
                예, 다시 선택할게요
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
