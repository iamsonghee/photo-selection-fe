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
  const [mounted, setMounted] = useState(false);
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (project && project.status !== "delivered") {
      router.replace(`/c/${token}`);
    }
  }, [project?.status, token, router]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  if (project.status !== "delivered") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">이동 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0] flex flex-col items-center justify-center px-5">
      <div className="text-[44px] mb-4">✅</div>
      <h1 className="text-xl font-semibold text-white mb-2">보정본 납품이 완료되었습니다</h1>
      <p className="text-sm text-zinc-400 text-center">
        {photographer?.name ?? "작가"}님이 최종 보정본을 전달했습니다.
        <br />
        문의사항이 있으시면 작가에게 연락해 주세요.
      </p>
    </div>
  );
}
