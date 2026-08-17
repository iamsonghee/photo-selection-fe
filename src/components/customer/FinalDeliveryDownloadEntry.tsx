"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, PackageOpen, X } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";

type ArchiveFile = { partNumber: number; fileCount: number; byteSize: number; url?: string };
type Info = {
  visible: boolean; expired: boolean; preparing: boolean; failed: boolean;
  fileCount: number; totalBytes: number; expiresAt: string | null; files: ArchiveFile[];
};

export default function FinalDeliveryDownloadEntry({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadFiles, setDownloadFiles] = useState<ArchiveFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/c/final-delivery?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (response.ok) setInfo(await response.json());
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!info?.preparing) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [info?.preparing, load]);

  async function prepareDownload() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/c/final-delivery/archive?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { files?: ArchiveFile[]; error?: string };
      if (!response.ok || !data.files?.length) throw new Error("최종 보정본이 아직 준비되지 않았습니다.");
      setDownloadFiles(data.files);
      if (data.files.length === 1 && data.files[0].url) window.location.assign(data.files[0].url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "다운로드를 준비하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!info?.visible) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full min-h-12 rounded-xl border border-accent/60 bg-accent/10 text-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-accent/15 transition-colors">
        <PackageOpen size={17} /> 최종 보정본 다운로드
      </button>
      {open && (
        <div role="presentation" onClick={(event) => event.target === event.currentTarget && setOpen(false)} className="fixed inset-0 z-[1200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-label="최종 보정본 다운로드" className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-2xl p-6 text-left">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-bold text-foreground m-0">최종 보정본 다운로드</h2><p className="mt-2 text-sm text-muted-foreground">{info.fileCount}장 · {formatStoredFileSizeBytes(info.totalBytes)}</p></div>
              <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="mt-5 rounded-xl bg-white/[0.03] border border-border p-4 text-sm text-muted-foreground">
              {info.expired ? "다운로드 기간이 만료되었습니다. 작가에게 문의해주세요."
                : info.failed ? "압축파일 준비 중 문제가 발생했습니다. 작가에게 문의해주세요."
                : info.preparing ? "최종 보정본 압축파일을 준비하고 있어요. 잠시 후 자동으로 갱신됩니다."
                : "업로드된 원본 크기 그대로 ZIP 파일로 다운로드합니다."}
              {!info.expired && info.totalBytes >= 500 * 1024 * 1024 && <p className="mt-2 mb-0 text-xs">용량이 큰 파일은 PC에서 다운로드하는 것을 권장해요.</p>}
            </div>
            {downloadFiles.length > 1 && <div className="mt-4 grid gap-2">{downloadFiles.map((file) => (
              <a key={file.partNumber} href={file.url} className="min-h-11 rounded-lg border border-border px-4 flex items-center justify-between text-sm text-foreground hover:border-accent">
                <span>압축파일 {file.partNumber}</span><span className="text-muted-foreground">{file.fileCount}장 · {formatStoredFileSizeBytes(file.byteSize)}</span>
              </a>
            ))}</div>}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <button type="button" disabled={loading || info.expired || info.preparing || info.failed || info.files.length === 0} onClick={() => void prepareDownload()} className="mt-5 w-full min-h-12 rounded-xl bg-accent text-black font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
              {downloadFiles.length > 1 ? "다운로드 링크 새로 받기" : "압축파일 다운로드"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
