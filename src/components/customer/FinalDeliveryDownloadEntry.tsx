"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { formatStoredFileSizeBytes } from "@/lib/format-file-size";
import { Badge } from "@/components/ui/Badge";
import { customerDDay } from "@/lib/customer-dday";
import { formatKstLongDateTime } from "@/lib/kst-date";
import { FinalDeliveryPreview } from "@/components/customer/FinalDeliveryPreview";
import type { FinalDeliveryPreviewFile } from "@/lib/customer-api-server";
import styles from "./FinalDeliveryDownloadEntry.module.css";

type ArchiveFile = { partNumber: number; fileCount: number; byteSize: number; url?: string };
type Info = {
  visible: boolean; expired: boolean; preparing: boolean; failed: boolean;
  fileCount: number; totalBytes: number; expiresAt: string | null; files: ArchiveFile[];
  previewFiles?: FinalDeliveryPreviewFile[];
};

export default function FinalDeliveryDownloadEntry({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadFiles, setDownloadFiles] = useState<ArchiveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/c/final-delivery?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("상태 조회 실패");
      setInfo(await response.json());
      setLoadError(false);
    } catch { setLoadError(true); }
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
      if (data.files.length === 1 && data.files[0].url) {
        window.location.assign(data.files[0].url);
      } else {
        // 일반적인 단일 ZIP은 바로 받고, 분할 압축일 때만 파일 선택 창을 연다.
        setOpen(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "다운로드를 준비하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (loadError && !info) return <div role="status" className="text-sm text-muted-foreground">다운로드 정보를 불러오지 못했어요. <button type="button" className="underline" onClick={() => void load()}>다시 시도</button></div>;
  if (!info) return <p role="status" className="text-sm text-muted-foreground">다운로드 정보를 확인하고 있어요.</p>;
  if (!info.visible) return <p className="text-sm text-muted-foreground">다운로드할 최종 보정본이 아직 없습니다. 작가에게 전달 상태를 확인해 주세요.</p>;
  const deadline = customerDDay(info.expiresAt);
  const expiresLabel = info.expiresAt && !Number.isNaN(new Date(info.expiresAt).getTime())
    ? formatKstLongDateTime(info.expiresAt) : null;
  return (
    <>
      {/* 고객이 모달을 열기 전 장수·기한·준비 상태를 판단할 수 있어야 한다. */}
      <div className={`${styles.layout} ${(info.previewFiles?.length ?? 0) === 0 ? styles.noPreview : ""}`}>
        <FinalDeliveryPreview files={info.previewFiles ?? []} />
        <section className={styles.downloadCard} aria-label="최종 보정본 다운로드">
          <div aria-label="최종 보정본 다운로드 정보" className={styles.info}>
            <h2>최종 보정본 다운로드</h2>
            <p className={styles.fileMeta}>{info.fileCount.toLocaleString()}장 <span aria-hidden>·</span> {formatStoredFileSizeBytes(info.totalBytes)}</p>
            {expiresLabel && <p className={styles.deadline}><span className={styles.deadlineLabel}>다운로드 기한</span><time dateTime={info.expiresAt ?? undefined}>{expiresLabel}까지 (한국 시간)</time>{deadline && <Badge tone={deadline.tone} theme="customerLight" className="font-mono">{deadline.label}</Badge>}</p>}
            <p role="status" className={styles.status}>{info.expired ? "다운로드 기간이 만료되었습니다. 작가에게 문의해 주세요." : info.failed ? "파일 준비 중 문제가 생겼습니다. 작가에게 문의해 주세요." : info.preparing ? "ZIP 파일을 준비 중이에요. 준비 상태가 자동으로 갱신됩니다." : "원본 크기 · ZIP 파일"}</p>
          </div>
          <button
            type="button"
            disabled={loading || info.expired || info.preparing || info.failed || info.files.length === 0}
            onClick={() => void prepareDownload()}
            className={styles.downloadButton}
          >
            {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Download size={17} />}
            {loading ? "다운로드 준비 중" : info.files.length > 1 ? `최종 보정본 ${info.files.length}개 받기` : "최종 보정본 다운로드"}
          </button>
          {error && !open ? <p role="alert" className={styles.error}>{error}</p> : null}
        </section>
      </div>
      {open && (
        <div role="presentation" onClick={(event) => event.target === event.currentTarget && setOpen(false)} className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-label="분할 압축파일 다운로드" className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl p-5 text-left">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="m-0 text-lg font-bold text-foreground">압축파일 나눠 받기</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">용량 때문에 {downloadFiles.length}개 파일로 나뉘었습니다.</p></div>
              <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="mt-4 grid gap-2">{downloadFiles.map((file) => (
              <a key={file.partNumber} href={file.url} className="flex min-h-12 items-center justify-between rounded-lg border border-border px-3 text-sm text-foreground hover:border-accent">
                <span className="inline-flex items-center gap-2 font-semibold"><Download size={15} aria-hidden />파일 {file.partNumber}</span><span className="text-xs text-muted-foreground">{file.fileCount}장 · {formatStoredFileSizeBytes(file.byteSize)}</span>
              </a>
            ))}</div>
          </section>
        </div>
      )}
    </>
  );
}
