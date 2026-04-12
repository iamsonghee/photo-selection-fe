"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import styles from "./about.module.css";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

function LoadingScreen() {
  return (
    <div className={styles.root}>
      <p style={{ margin: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#555", letterSpacing: "0.12em" }}>
        LOADING_ABOUT…
      </p>
    </div>
  );
}

export default function AboutPageClient() {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const photos = ctx?.photos ?? [];
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

  if (loading) return <LoadingScreen />;

  if (!project) {
    return (
      <div className={styles.root} style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p className={styles.subtitle} style={{ textAlign: "center" }}>
          유효하지 않은 초대 링크입니다.
        </p>
        <Link href="/" className={styles.btnSub} style={{ marginTop: 16 }}>
          ← 홈으로
        </Link>
      </div>
    );
  }

  const photographerName = photographer?.name?.trim() || "작가";
  const N = project.requiredCount ?? 0;
  const photoTotal = photos.length > 0 ? photos.length : project.photoCount ?? 0;
  const customerName = project.customerName?.trim() || "고객";

  const invitePath = `/c/${token}`;
  const galleryPath = `/c/${token}/gallery`;

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

      <main className={styles.aboutContainer}>
        <section className={styles.heroSection}>
          <div className={styles.portalCmd}>CMD :: SYS.ABOUT_PAGE</div>
          <h1 className={styles.heroTitle}>
            처음 오셨나요?
            <br />
            <span className={styles.highlight}>3분이면 충분해요.</span>
          </h1>
          <p className={styles.subtitle}>
            A컷은 사진작가와 고객을 연결하는 사진 셀렉 서비스예요. 복잡한 설치 없이, 링크 하나로 사진을 보고 고르실 수 있어요.
          </p>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <div className={styles.sysLabel}>DATA :: FLOW_STEPS</div>
            <h2 className={styles.sectionTitle}>이렇게 하시면 돼요</h2>
          </div>
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNum}>STEP.01</div>
              <h3>갤러리에서 사진 구경하기</h3>
              <p>업로드된 사진을 자유롭게 둘러보세요. 별점을 매기거나 색상 태그로 분류해두면 나중에 고르기 더 쉬워요.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNum}>STEP.02</div>
              <h3>마음에 드는 사진 선택하기</h3>
              <p>
                사진을 클릭하면 크게 볼 수 있어요. 마음에 드는 사진은 버튼 한 번으로 선택됩니다. {photographerName}님이 요청한 {N}장을
                골라주세요.
              </p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNum}>STEP.03</div>
              <h3>최종 확정하기</h3>
              <p>
                {N}장을 다 고르셨으면 확정 버튼을 눌러주세요. 작가님께 바로 전달되고, 보정이 시작됩니다. 확정 전까지는 언제든 변경할 수
                있어요.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <div className={styles.sysLabel}>DATA :: COMPARISON</div>
            <h2 className={styles.sectionTitle}>기존 방식과 비교보면</h2>
          </div>
          <div className={styles.compTable}>
            <div className={`${styles.compRow} ${styles.compHeader}`}>
              <div className={`${styles.compCell} ${styles.compCellFeature}`}>비교 항목</div>
              <div className={`${styles.compCell} ${styles.compCellOld}`}>기존 방식</div>
              <div className={`${styles.compCell} ${styles.compCellNew} ${styles.compHeaderNew}`}>A컷</div>
            </div>
            <div className={styles.compRow}>
              <div className={`${styles.compCell} ${styles.compCellFeature}`}>사진 전달</div>
              <div className={`${styles.compCell} ${styles.compCellOld}`}>드라이브 링크</div>
              <div className={`${styles.compCell} ${styles.compCellNew}`}>전용 갤러리 링크</div>
            </div>
            <div className={styles.compRow}>
              <div className={`${styles.compCell} ${styles.compCellFeature}`}>셀렉 방법</div>
              <div className={`${styles.compCell} ${styles.compCellOld}`}>파일명 적어서 카톡</div>
              <div className={`${styles.compCell} ${styles.compCellNew}`}>클릭 한 번</div>
            </div>
            <div className={styles.compRow}>
              <div className={`${styles.compCell} ${styles.compCellFeature}`}>확인 시간</div>
              <div className={`${styles.compCell} ${styles.compCellOld}`}>평균 왕복 3~5회</div>
              <div className={`${styles.compCell} ${styles.compCellNew}`}>1회 확정</div>
            </div>
            <div className={styles.compRow}>
              <div className={`${styles.compCell} ${styles.compCellFeature}`}>재보정 요청</div>
              <div className={`${styles.compCell} ${styles.compCellOld}`}>텍스트 설명</div>
              <div className={`${styles.compCell} ${styles.compCellNew}`}>사진 보며 직접 코멘트</div>
            </div>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <div className={styles.sysLabel}>LOG :: USER_REVIEWS</div>
            <h2 className={styles.sectionTitle}>먼저 써보신 분들의 이야기</h2>
          </div>
          <div className={styles.reviewsGrid}>
            <div className={styles.reviewCard}>
              <div className={styles.quoteMark}>&quot;</div>
              <p className={styles.reviewText}>
                처음엔 또 뭔가 설치해야 하는 건가 싶었는데, 링크 누르니까 바로 사진이 뜨더라고요. 그냥 마음에 드는 거 누르면 되니까 너무
                편했어요. 파일명 적어서 내던 게 이제 생각도 안 나요.
              </p>
              <div className={styles.reviewAuthor}>김수연 · 웨딩 촬영 고객 · 2026년 3월 이용</div>
            </div>
            <div className={styles.reviewCard}>
              <div className={styles.quoteMark}>&quot;</div>
              <p className={styles.reviewText}>
                보정본 비교하는 게 제일 좋았어요. 원본이랑 나란히 보이니까 어떻게 달라졌는지 바로 알 수 있고, 마음에 안 드는 부분도 딱
                짚어서 얘기할 수 있었어요.
              </p>
              <div className={styles.reviewAuthor}>이현지 · 돌스냅 촬영 고객 · 2026년 2월 이용</div>
            </div>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeader}>
            <div className={styles.sysLabel}>DOC :: FAQ</div>
            <h2 className={styles.sectionTitle}>자주 묻는 질문</h2>
          </div>
          <div className={styles.faqList}>
            <div className={styles.faqItem}>
              <div className={styles.faqQ}>
                <span className={styles.qMark}>Q.</span> 설치가 필요한가요?
              </div>
              <div className={styles.faqA}>아니요. 링크를 열면 바로 사용 가능해요. 앱 설치 없이 브라우저에서 바로 됩니다.</div>
            </div>
            <div className={styles.faqItem}>
              <div className={styles.faqQ}>
                <span className={styles.qMark}>Q.</span> 선택한 사진을 바꿀 수 있나요?
              </div>
              <div className={styles.faqA}>확정 버튼을 누르기 전까지는 언제든 바꿀 수 있어요. 확정 후에도 작가님께 연락하시면 돼요.</div>
            </div>
            <div className={styles.faqItem}>
              <div className={styles.faqQ}>
                <span className={styles.qMark}>Q.</span> 사진은 얼마나 보관되나요?
              </div>
              <div className={styles.faqA}>작가님이 프로젝트를 관리하는 동안 보관됩니다. 자세한 내용은 담당 작가님께 문의해주세요.</div>
            </div>
            <div className={styles.faqItem}>
              <div className={styles.faqQ}>
                <span className={styles.qMark}>Q.</span> 모바일에서도 되나요?
              </div>
              <div className={styles.faqA}>네, 아이폰·안드로이드 모두 잘 돼요. 별도 앱 없이 카카오톡에서 링크를 열면 바로 사용 가능합니다.</div>
            </div>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.portalCard}>
            <h2 className={`${styles.sectionTitle} ${styles.ctaTitle}`}>준비되셨나요?</h2>
            <p className={`${styles.subtitle} ${styles.ctaSubtitle}`}>
              {customerName}님의 사진 {photoTotal}장이 기다리고 있어요.
            </p>
            <div>
              <Link href={galleryPath} className={styles.btnPrimary} scroll={false}>
                지금 사진 보러 가기 <span className={styles.arrow}>→</span>
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
