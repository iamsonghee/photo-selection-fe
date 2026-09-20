"use client";

/** S7 — 최종 검토. */
import { useParams, useRouter } from "next/navigation";
import { BrandLogoBar } from "@/components/BrandLogo";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import {
  activeParticipants,
  bothDone,
  requestedPhotoIds,
  tasteMatchPct,
  useCustomerSelectStore,
} from "../../_lib/real-store";
import ui from "../../_lib/ui.module.css";

export default function CustomerReviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { project, hydrated } = useCustomerSelectStore();

  const selected = project.photos.filter((p) => project.selectedIds.includes(p.id));
  const requested = requestedPhotoIds(project);
  const match = tasteMatchPct(project);
  const done = bothDone(project);
  const waiting = activeParticipants(project).filter((p) => !project.participantDone[p.id]);

  // 하이드레이션 전 첫 프레임 — real-store.tsx 참고(서버/클라이언트 렌더 불일치 방지).
  if (!hydrated) {
    return <SystemLoadingScreen title="셀렉 결과를 불러오고 있어요" />;
  }

  return (
    <div className={ui.shell}>
      <header className={ui.brandbar}>
        <BrandLogoBar size="sm" href="/customer-select" variant="default" />
      </header>
      <div className={ui.shellMain}>
      <div className={ui.page}>
        <div className={ui.header}>
          <button type="button" className={ui.back} onClick={() => router.back()}>
            ←
          </button>
          <h1 className={ui.title}>최종 검토</h1>
        </div>
        <div className={ui.body}>
          <div style={{ display: "flex", gap: 8 }}>
            <div className={ui.statPill}>
              <span className={ui.n}>{selected.length}장</span>
              <span className={ui.l}>선택한 사진</span>
            </div>
            <div className={ui.statPill}>
              <span className={ui.n}>{requested.length}장</span>
              <span className={ui.l}>보정 요청</span>
            </div>
            {match !== null && (
              <div className={`${ui.statPill} ${ui.statPillAccent}`}>
                <span className={ui.n}>{match}%</span>
                <span className={ui.l}>취향 일치율</span>
              </div>
            )}
          </div>

          {!done && waiting.length > 0 && (
            <div className={`${ui.banner} ${ui.bannerWarn}`}>
              <span className={ui.bannerHeadWarn}>
                {waiting.map((p) => p.name).join(", ")}님이 아직 고르는 중이에요
              </span>
              <span className={ui.bodyText}>그래도 지금 전달할 수 있어요.</span>
            </div>
          )}

          <div>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              선택한 사진
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {selected.slice(0, 12).map((p) => (
                <div key={p.id} style={{ aspectRatio: "1", borderRadius: 4, overflow: "hidden", position: "relative", background: "#eee" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {project.photoStates[p.id]?.comment && (
                    <span style={{ position: "absolute", top: 4, left: 4, fontSize: 11 }}>💬</span>
                  )}
                </div>
              ))}
              {selected.length > 12 && (
                <div
                  style={{
                    aspectRatio: "1",
                    borderRadius: 4,
                    background: "#f7f6f4",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 12,
                    color: "#8b8985",
                  }}
                >
                  +{selected.length - 12}
                </div>
              )}
            </div>
          </div>

          <hr className={ui.divider} />

          <div>
            <p className={ui.label} style={{ marginBottom: 8 }}>
              보정 요청이 있는 사진
            </p>
            {requested.length === 0 ? (
              <p className={ui.bodyText}>아직 작성한 보정 요청이 없어요.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {requested.map((id) => {
                  const p = project.photos.find((x) => x.id === id)!;
                  return (
                    <div key={id} className={ui.reqItem}>
                      <span className="fn">{getPhotoDisplayName(p)}</span>
                      <span className="tx">{project.photoStates[id]?.comment}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <PhotographerPageActionBar
          maxWidth={1120}
          actions={<>
            <PhotographerLightButton variant="secondary" onClick={() => router.push(`/customer-select/${projectId}/select`)}>더 고르기</PhotographerLightButton>
            <PhotographerLightButton disabled={selected.length === 0} onClick={() => router.push(`/customer-select/${projectId}/export`)}>전달 내용 만들기</PhotographerLightButton>
          </>}
        />
      </div>
      </div>
    </div>
  );
}
