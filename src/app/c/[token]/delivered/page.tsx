"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useSelectionOptional } from "@/contexts/SelectionContext";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

export default function DeliveredPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const [mounted, setMounted] = useState(false);
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (project && project.status !== "delivered") router.replace(`/c/${token}`);
  }, [project?.status, token, router]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">불러오는 중...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  if (project.status !== "delivered") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">이동 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center">
      <div className="w-full max-w-[400px]">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#0f2a1e] border-2 border-[#2ed573]">
          <span className="text-[36px]">✅</span>
        </div>

        {/* Title */}
        <h1 className="mb-2 text-[22px] font-bold text-[#e8eaf0]">납품이 완료되었습니다</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#8b90a8]">
          {photographer?.name ?? "작가"}님이 최종 보정본을 전달했습니다.<br />
          문의사항은 작가에게 연락해 주세요.
        </p>

        {/* Card */}
        <div className="rounded-2xl border border-[#1e2236] bg-[#111318] p-6">
          <div className="flex items-center gap-3">
            {photographer?.profile_image_url && (
              <img
                src={photographer.profile_image_url}
                alt=""
                className="h-11 w-11 rounded-full object-cover shrink-0"
              />
            )}
            <div className="text-left">
              <div className="text-[13px] font-semibold text-[#e8eaf0]">
                {photographer?.name ?? "담당 작가"}
              </div>
              <div className="text-[11px] text-[#5a5f78]">{project.name}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-[#1a1d24] px-4 py-3 text-[13px] text-[#8b90a8] text-left leading-relaxed">
            소중한 순간을 함께해서 영광이었습니다. 감사합니다 🙏
          </div>
        </div>
      </div>
    </div>
  );
}
