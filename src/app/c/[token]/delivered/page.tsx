"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import styles from "./delivered.module.css";

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
      <div className={styles.root}>
        <p style={{ margin: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#555", letterSpacing: "0.12em" }}>
          LOADING_DELIVERED…
        </p>
      </div>
    );
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
    return (
      <div className={styles.root}>
        <p style={{ margin: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#555", letterSpacing: "0.12em" }}>
          REDIRECTING…
        </p>
      </div>
    );
  }

  const photographerName = photographer?.name?.trim() || "작가";
  const invitePath = token ? `/c/${token}` : "/";
  const galleryPath = token ? `/c/${token}/gallery` : "/";

  return (
    <div className={styles.root}>
      <div className={`${styles.viewportBracket} ${styles.bracketTl}`} aria-hidden />
      <div className={`${styles.viewportBracket} ${styles.bracketTr}`} aria-hidden />
      <div className={`${styles.viewportBracket} ${styles.bracketBl}`} aria-hidden />
      <div className={`${styles.viewportBracket} ${styles.bracketBr}`} aria-hidden />

      <header className={styles.topHeader}>
        <div className={styles.headerSide}>
          <Link href={invitePath} className={styles.btnSub} scroll={false}>
            ← 돌아가기
          </Link>
        </div>
        <div className={styles.brandCluster}>
          <div className={styles.logoBox}>A</div>
          <div className={styles.brandName}>
            A컷 <span>Acut</span>
          </div>
        </div>
        <div className={styles.headerSide} />
      </header>

      <main className={styles.container}>
        <div className={styles.portalCmd}>LOG :: DELIVERY_COMPLETE</div>
        <h1 className={styles.title}>
          납품이 완료됐습니다!
        </h1>
        <p className={styles.subtitle}>
          {photographerName}님이 최종 보정본을 전달했습니다.
          <br />
          문의사항은 작가에게 연락해 주세요.
        </p>

        <section className={styles.card} aria-label="납품 완료 정보">
          <div className={styles.successBadge} aria-hidden>
            <PackageCheck style={{ width: 32, height: 32, color: "var(--accent-green)" }} />
          </div>

          <div className={styles.detailBox}>
            {photographer?.profile_image_url ? (
              <div className={styles.profileRow}>
                <img src={photographer.profile_image_url} alt="" className={styles.avatar} />
                <div style={{ minWidth: 0 }}>
                  <p className={styles.name}>{photographerName}</p>
                  <p className={styles.meta}>{project.name}</p>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <p className={styles.name}>{photographerName}</p>
                <p className={styles.meta}>{project.name}</p>
              </div>
            )}

            <div className={styles.message}>소중한 순간을 함께해서 영광이었습니다. 감사합니다</div>

            <div className={styles.ctaRow}>
              <Link href={galleryPath} className={styles.btnPrimary} scroll={false}>
                갤러리로 이동
              </Link>
              <Link href={invitePath} className={styles.btnGhost} scroll={false}>
                프로젝트 홈
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.pageFooter}>
        <div>© 2026 A컷 · Acut</div>
        <div className={styles.footerNote}>{photographerName} 작가님이 A컷을 통해 전달했습니다.</div>
      </footer>
    </div>
  );
}
