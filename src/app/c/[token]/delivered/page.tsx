"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { PackageCheck } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { PS_DISPLAY } from "@/lib/photographer-theme";
import { BrandLogoBar } from "@/components/BrandLogo";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

const playfair: React.CSSProperties = { fontFamily: PS_DISPLAY };
const headerBg: React.CSSProperties = { background: "rgba(10,10,11,0.92)", backdropFilter: "blur(12px)" };
const gridBg: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(79,126,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(79,126,255,0.05) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
};

function PageHeader({ right, inviteHref }: { right?: React.ReactNode; inviteHref?: string }) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 px-4"
      style={{ ...headerBg, paddingTop: "env(safe-area-inset-top, 0px)", minHeight: 48 }}
    >
      <BrandLogoBar size="sm" href={inviteHref} />
      {right && <div className="text-[12px] text-zinc-400 truncate max-w-[180px]">{right}</div>}
    </header>
  );
}

function PageFooter() {
  return (
    <footer className="py-5 text-center text-[11px] text-zinc-500">
      © 2026 A CUT
    </footer>
  );
}

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
    return <div className="flex min-h-screen items-center justify-center bg-[#050505]"><p className="text-sm text-[#5a5f78]">불러오는 중...</p></div>;
  }
  if (!project) {
    return <div className="flex min-h-screen items-center justify-center bg-[#050505]"><p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p></div>;
  }
  if (project.status !== "delivered") {
    return <div className="flex min-h-screen items-center justify-center bg-[#050505]"><p className="text-sm text-[#5a5f78]">이동 중...</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100" style={gridBg}>
      <PageHeader right={project.name} inviteHref={token ? `/c/${token}` : undefined} />

      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#111318]/95 p-6 text-center md:p-8" style={{ backdropFilter: "blur(8px)" }}>
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#2ed573] bg-[#0f2a1e]">
              <PackageCheck className="h-8 w-8 text-[#2ed573]" />
            </div>
          </div>

          <h1 className="mb-2 text-[22px] font-bold text-zinc-100" style={playfair}>
            납품이 완료됐습니다!
          </h1>
          <p className="mb-6 text-[13px] leading-relaxed text-[#8b90a8]">
            {photographer?.name ?? "작가"}님이 최종 보정본을 전달했습니다.<br />
            문의사항은 작가에게 연락해 주세요.
          </p>

          <div className="rounded-xl border border-white/10 bg-[#1a1d24] p-4 text-left">
            {photographer?.profile_image_url && (
              <div className="mb-3 flex items-center gap-3">
                <img src={photographer.profile_image_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                <div>
                  <div className="text-[13px] font-semibold text-zinc-100">{photographer?.name ?? "담당 작가"}</div>
                  <div className="text-[11px] text-[#5a5f78]">{project.name}</div>
                </div>
              </div>
            )}
            <div className="rounded-xl bg-[#111318] px-3.5 py-3 text-[12px] leading-relaxed text-[#8b90a8]">
              소중한 순간을 함께해서 영광이었습니다. 감사합니다
            </div>
          </div>
        </div>
        <PageFooter />
      </div>
    </div>
  );
}
