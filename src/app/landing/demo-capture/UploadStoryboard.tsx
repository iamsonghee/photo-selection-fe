/* eslint-disable @next/next/no-img-element -- 정지 시안은 제공된 로컬 사진을 직접 표시한다. */
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FolderOpen, LayoutDashboard, LayoutGrid, MousePointer2, Search, Upload, SquarePen } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { OriginalPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { PhotoAssetPreview } from "@/components/photographer/PhotoAssetPreview";
import { ProjectAssetTabs } from "@/components/photographer/ProjectAssetTabs";
import { ProjectAssetToolbarButton } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getSamplePhoto, SAMPLE_PROJECT } from "../sample-project";
import "./capture.css";
import "./storyboard.css";
import "./film.css";
import "./upload-storyboard.css";

const PICKS = ["01", "06", "10"];
const COMMENT = "얼굴 주변 잔머리만 자연스럽게 정리해주세요.";
const noop = () => {};

/** 검토용 정지 시안. 실제 파일 전송·인증·업로드 패널의 API 훅을 실행하지 않는다. */
export function UploadStoryboard({ frameTime }: { frameTime?: number } = {}) {
  const [previewTime, setTime] = useState(13);
  const time = frameTime ?? previewTime;
  const [queue] = useState(() => createThumbLoadQueue(20));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (frameTime !== undefined) return;
    const target = window as unknown as { renderDemoFrame?: (seconds: number) => void };
    target.renderDemoFrame = setTime;
    return () => { delete target.renderDemoFrame; };
  }, [frameTime]);
  const retouch = time >= 15;
  const uploading = time >= 16 && time < 18;
  const complete = time >= 18;
  const photos = PICKS.map((id, index) => ({ id, projectId: "landing-sample", orderIndex: index, url: getSamplePhoto(id).originalSrc, originalFilename: getSamplePhoto(id).filename }));
  return <div id={frameTime === undefined ? "demo-film" : undefined} className="film-storyboard film-final upload-storyboard" data-time={time}>
    {/* 부모의 프레임 시간을 받아 파일 이동·진행·완료를 표현한다. 실제 업로드는 호출하지 않는다. */}
    <section className="film-screen film-writer">
      <nav className="story-sidebar"><BrandLogoBar variant="customerEntry" /><small>WORKSPACE</small><span><LayoutDashboard size={17} /> 대시보드</span><span className="story-nav-active"><FolderOpen size={17} /> 프로젝트</span><div className="story-profile">민서 스튜디오<small>작가 워크스페이스</small></div></nav>
      <div className="story-workspace">{frameTime !== undefined && time >= 14.7 && time < 15.1 && <MousePointer2 className="us-tab-cursor" size={23} fill="white" />}<header><span>프로젝트 / {SAMPLE_PROJECT.name}</span><strong><Check size={14} /> 고객 셀렉 완료</strong></header>
        <div className="story-project-heading"><div><small>고객 · 민서와 지훈</small><h1>{retouch ? "보정본 업로드" : "셀렉 결과"}</h1></div><span>선택한 사진 <strong>3장</strong></span></div>
        <div className="film-writer-toolbar"><ProjectAssetTabs projectId="landing-sample" status="editing" activeTab={retouch ? "retouched" : "selected"} originalCount={10} selectedCount={3} /><div className="story-tools">{retouch ? <ProjectAssetToolbarButton variant="secondary"><Upload size={14} />일괄 업로드</ProjectAssetToolbarButton> : <ProjectAssetToolbarButton><Copy size={14} />파일명 복사</ProjectAssetToolbarButton>}<ProjectAssetToolbarButton><Download size={14} />{retouch ? "내보내기" : "CSV"}</ProjectAssetToolbarButton></div></div>
        <div className="story-list-toolbar"><span><LayoutGrid size={16} />{retouch ? `보정본 ${complete ? 1 : 0} / 3장` : "선택 사진 3장"}</span><span><Search size={14} /> 파일명 검색</span></div>
        {!retouch ? <div ref={scrollRef} className="story-photo-list"><OriginalPhotoGallery photos={photos} scrollRef={scrollRef} viewMode="grid" variant="selection" mobileGridGap={60} readonly thumbQueue={queue} onPhotoClick={noop} getSecondaryText={p => p.id === "01" ? COMMENT : ""} /></div> :
          <div className="us-grid">{PICKS.map(id => {
            const p = getSamplePhoto(id), ready = id === "01" && complete, busy = id === "01" && uploading;
            return <article key={id} className="us-card">
              {/* 실제 V1Card의 원본 참조·파일명·개별 업로드 슬롯 배치를 샘플 상태로 재현한다. */}
              <PhotoAssetPreview filename={ready ? "ACUT_0001-보정.jpg" : p.filename} header={<div className="us-reference"><img src={p.originalSrc} alt="원본" /><div><strong>{ready ? "ACUT_0001-보정.jpg" : p.filename}</strong>{ready && <small>원본 · ACUT_0001.jpg</small>}</div></div>}>
                {ready ? <><img className="us-retouched" style={{ opacity: Math.min(1, Math.max(0, (time - 18) / .2)) }} src={p.retouchedSrc} alt="ACUT_0001-보정.jpg" /><span className="us-replace"><SquarePen size={12} /></span></> : <div className="us-slot" data-busy={busy}>{busy ? <span className="us-spinner" style={{ transform: `rotate(${time * 360}deg)` }} /> : <Upload size={20} />}<strong>{busy ? "업로드 중" : "보정본 업로드"}</strong>{!busy && <small>선택 즉시 업로드 · 파일을 놓아도 됩니다</small>}</div>}
              </PhotoAssetPreview>
              {id === "01" && !uploading && !complete && <div className="us-drag-file" style={frameTime === undefined ? undefined : { opacity: Math.min(1, Math.max(0, (time - 15.15) / .15)), transform: `translate(${Math.max(0, 1 - (time - 15.2) / .65) * 140}px, ${Math.max(0, 1 - (time - 15.2) / .65) * -45}px) rotate(-3deg)` }}><img src={p.retouchedSrc} alt="" /><span>ACUT_0001-보정.jpg</span><MousePointer2 size={21} fill="white" /></div>}
            </article>;
          })}</div>}
        <footer><span>{retouch ? complete ? "보정본 1장 업로드 완료 · 나머지 2장은 업로드 대기" : "" : "선택한 사진과 고객 요청이 함께 정리됐어요."}</span>{(!retouch || complete) && <Check size={16} />}</footer>
      </div>
    </section>
  </div>;
}
