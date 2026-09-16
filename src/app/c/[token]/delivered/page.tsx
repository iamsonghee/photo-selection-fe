"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import styles from "./delivered.module.css";
import { BrandLogoBar } from "@/components/BrandLogo";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { useCustomerLightCanvas } from "@/lib/use-customer-light-canvas";
import OriginalDownloadEntry from "@/components/customer/OriginalDownloadEntry";
import FinalDeliveryDownloadEntry from "@/components/customer/FinalDeliveryDownloadEntry";
import { formatKstLongDate } from "@/lib/kst-date";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

const subscribeToHydration = () => () => {};

export default function DeliveredPage() {
  useCustomerLightCanvas();
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (project && project.status !== "delivered") router.replace(`/c/${token}`);
  }, [project, token, router]);

  if (!mounted || loading) {
    return <SystemLoadingScreen />;
  }
  if (!project) {
    return (
      <div className={styles.root}>
        <div style={{ margin: "auto", padding: 24, textAlign: "center" }}>
          <p className={styles.subtitle}>존재하지 않는 초대 링크입니다.</p>
          <Link href="/" className={styles.btnSub} style={{ justifyContent: "center", marginTop: 16 }}>
            ← 홈으로
          </Link>
        </div>
      </div>
    );
  }
  if (project.status !== "delivered") {
    return <SystemLoadingScreen />;
  }

  const photographerName = photographer?.name?.trim() || "작가";
  const invitePath = token ? `/c/${token}` : "/";
  const projectFacts = (<dl className={styles.facts}>
              {project.shootDate && <div><dt>촬영일</dt><dd>{formatDate(project.shootDate)}</dd></div>}
              {project.location && <div><dt>촬영 장소</dt><dd>{project.location}</dd></div>}
              {project.deliveredAt && <div><dt>수령 완료일</dt><dd>{formatDate(project.deliveredAt)}</dd></div>}
            </dl>);
  return (
    <div className={styles.root}>
      <CustomerHeader theme="customerLight">
        <BrandLogoBar size="sm" href={invitePath} variant="customerEntry" />
        <span className="font-mono text-[11px] text-subtle-foreground max-w-[180px] truncate">{project.name}</span>
      </CustomerHeader>

      <main className={styles.container}>
        <header className={styles.intro}>
          <div className={styles.portalCmd}>최종 납품 완료</div>
          <h1 className={styles.title}>{project.name}</h1>
        </header>

        <section className={styles.card} aria-label="완료 정보">
          <div className={styles.projectBar}>
            {photographer?.profile_image_url ? (
              <div className={styles.profileRow}>
                <img src={photographer.profile_image_url} alt="" className={styles.avatar} />
                <div style={{ minWidth: 0 }}>
                  <p className={styles.name}>{photographerName}</p>

                </div>
              </div>
            ) : (
              <div className={styles.profileText}>
                <p className={styles.name}>{photographerName}</p>

              </div>
            )}

            {/* 날짜가 실제로 제공된 경우에만 표시한다. 기한은 다운로드 API 기준으로 안내한다. */}
            {projectFacts}
          </div>
          <div className={styles.deliveryBody}><FinalDeliveryDownloadEntry token={token} /></div>
          {project.includeOriginal && <div className={styles.originalRow}><div><strong>촬영 원본</strong></div><OriginalDownloadEntry token={token} variant="inline" /></div>}
        </section>
        <aside className={styles.saveNote} aria-label="사진 보관 안내">
          <p>다운로드 후 압축을 풀어 확인하고, 별도 저장 공간에 백업해 주세요.</p>
        </aside>
      </main>


    </div>
  );
}

function formatDate(value: string) {
  if (Number.isNaN(new Date(value).getTime())) return "—";
  return formatKstLongDate(value);
}
