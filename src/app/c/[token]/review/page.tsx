"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";

const MONO = "'JetBrains Mono', 'Space Mono', monospace";

export default function ReviewRedirectPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading } = useReview();

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  useEffect(() => {
    if (selectionLoading || reviewPhotosLoading) return;
    if (!project) return;

    const canReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
    if (!canReview) { router.replace(`/c/${token}`); return; }

    if (reviewPhotos.length > 0) {
      router.replace(`/c/${token}/review/${reviewPhotos[0].id}`);
    }
  }, [selectionLoading, reviewPhotosLoading, project, reviewPhotos, token, router]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#030303" }}>
      <p style={{ fontFamily: MONO, fontSize: 11, color: "#555", letterSpacing: "0.1em" }}>
        LOADING_REVIEW...
      </p>
    </div>
  );
}
