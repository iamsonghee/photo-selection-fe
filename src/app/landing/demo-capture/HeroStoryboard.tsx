/* eslint-disable @next/next/no-img-element -- 로컬 녹화 프레임은 원본 자산을 직접 디코딩한다. */
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ArrowLeft, FolderOpen, LayoutDashboard, Copy, Download, LayoutGrid, Search, Star } from "lucide-react";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { OriginalPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import { PhotoCardComment } from "@/components/photographer/PhotoCardComment";
import { ProjectAssetToolbarButton } from "@/components/photographer/ProjectAssetWorkspaceToolbar";
import { ProjectAssetTabs } from "@/components/photographer/ProjectAssetTabs";
import { BrandLogoBar } from "@/components/BrandLogo";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getSamplePhoto, SAMPLE_PROJECT } from "../sample-project";
import "./capture.css";
import "./storyboard.css";

const IDS = ["01", "02", "05", "06", "10", "03", "04", "07", "08", "09"];
const PICKS = ["01", "06", "10"];
const COMMENT = "얼굴 주변 잔머리만 자연스럽게 정리해주세요.";
const RATINGS = { "01": 4, "06": 5, "10": 5 } as const;
const REQUEST_ID = "01";
const noop = () => {};

export function HeroStoryboard() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const photos = PICKS.map((id, index) => ({ id, projectId: "landing-sample", orderIndex: index, url: getSamplePhoto(id).originalSrc, originalFilename: getSamplePhoto(id).filename }));
  const [time, setTime] = useState(0);
  const [queue] = useState(() => createThumbLoadQueue(20));
  // 녹화 스크립트가 프레임 시간을 직접 주입한다. API·실시간 타이머·운영 데이터는 사용하지 않는다.
  useEffect(() => {
    const target = window as unknown as { renderDemoFrame?: (seconds: number) => void };
    target.renderDemoFrame = setTime;
    return () => { delete target.renderDemoFrame; };
  }, []);
  const count = time >= 4.5 ? 3 : time >= 3.5 ? 2 : time >= 2.5 ? 1 : 0;
  const writerOpacity = Math.min(1, Math.max(0, (time - 9) / .4)) * Math.min(1, Math.max(0, (15 - time) / .6));
  const end = time > 14.4;
  const detail = time >= 5 && time < 7.2;
  // 정지 시안도 실제 녹화 시간으로 재현한다. 구절 단위 입력과 저장 상태를 분리한다.
  const commentText = time < 5.45 ? "" : time < 5.85 ? "얼굴 주변 잔머리만" : time < 6.15 ? "얼굴 주변 잔머리만 자연스럽게" : COMMENT;
  // 모바일 터치는 클릭 시점에만 표시한다. 포인터 이동 연출은 넣지 않는다.
  const tap = [[2.5, 27, 129], [3.5, 27, 265], [4.5, 27, 401], [7.25, 255, 561], [8, 246, 347]]
    .find(([at]) => time >= at && time < at + .3);
  return <main id="demo-film" className="film-storyboard" aria-label="A-CUT 제품 시연" data-time={time}>
    <div className="film-customer-scene">
    <aside className="film-context"><span>고객의 셀렉</span><h1>받은 링크에서,<br />편한 시간에 골라요.</h1><p>사진을 고르고, 사진별 요청을 남기면<br />작가에게 한 번에 전달됩니다.</p><div className="film-picked">{PICKS.map((id, index) => <div key={id} data-selected={!end && count > index}><img src={getSamplePhoto(id).originalSrc} alt="" /><span>{getSamplePhoto(id).filename}</span>{!end && count > index && <Check size={18} />}</div>)}</div><small>{detail ? COMMENT : time >= 8.15 && !end ? "선택한 사진 3장과 요청을 전달했어요." : "선택한 사진과 요청이 함께 전달돼요."}</small></aside>
    <section className="film-screen film-customer">
      <header><BrandLogoBar variant="customerEntry" /><strong>{SAMPLE_PROJECT.name}</strong></header>
      <div className="film-toolbar"><strong>전체 사진 <small>10</small></strong><span>마음에 드는 사진 3장을 선택해 주세요.</span></div>
      <div className="film-gallery">{IDS.map((id, index) => { const sample = getSamplePhoto(id); return <GalleryPhotoCard key={id} token="landing-sample" photo={{ id, projectId: "landing-sample", orderIndex: index, url: sample.originalSrc, originalFilename: sample.filename }} selected={!end && PICKS.slice(0, count).includes(id)} rating={RATINGS[id as keyof typeof RATINGS]} hasComment={!end && time >= 6.4 && id === REQUEST_ID} showGroupBadge={false} restCount={0} totalCount={1} selectedCount={0} isGroupExpanded={false} presignedThumb={sample.originalSrc} thumbQueue={queue} viewerQueryString="" density={2} showFilename onPhotoClick={(e) => e.preventDefault()} onCheckClick={(e) => e.preventDefault()} onGroupBadgeClick={(e) => e.preventDefault()} onRate={noop} onThumbError={noop} />; })}</div>
      <footer><span>선택 <strong>{end ? 0 : count} / 3장</strong></span><button>{!end && time >= 8.15 ? <><Check size={18} />셀렉 제출 완료</> : "셀렉 확정하기"}</button></footer>
      {detail && <div className="film-detail" style={{ opacity: Math.min(1, (time - 5) / .22) }}>
        <div className="story-detail-heading"><ArrowLeft size={17} /><strong>ACUT_0001.jpg</strong><span><Check size={13} /> 선택됨</span></div>
        <div className="story-detail-photo"><img src={getSamplePhoto(REQUEST_ID).originalSrc} alt="ACUT_0001.jpg" /></div>
        <aside><div className="story-comment-label"><label>사진별 코멘트</label><span>이 사진에만 남기는 요청</span></div>
          <div className="film-comment" data-editing={time < 6.4}>{commentText}{time < 6.4 && <i className="story-caret" />}</div>
          <p className="story-saved">{time >= 6.4 ? <><Check size={12} /> 저장됨</> : "입력 중"}</p>
        </aside></div>}

    {time >= 7.3 && time < 8.15 && <SelectionConfirmDialog count={3} confirming={false} onCancel={noop} onConfirm={noop} />}
    {tap && <span className="film-tap" style={{ left: tap[1], top: tap[2], opacity: 1 - (time - tap[0]) / .3, transform: `translate(-50%,-50%) scale(${1 + (time - tap[0]) * 2})` }} />}
    </section></div>
    <section className="film-screen film-writer" style={{ opacity: writerOpacity }} aria-label="작가 셀렉 결과">
      <nav className="story-sidebar"><BrandLogoBar variant="customerEntry" /><small>WORKSPACE</small><span><LayoutDashboard size={17} /> 대시보드</span><span className="story-nav-active"><FolderOpen size={17} /> 프로젝트</span><div className="story-profile">민서 스튜디오<small>작가 워크스페이스</small></div></nav>
      <div className="story-workspace"><header><span>프로젝트 / {SAMPLE_PROJECT.name}</span><strong><Check size={14} /> 고객 셀렉 완료</strong></header>
      <div className="story-project-heading"><div><small>고객 · 민서와 지훈</small><h1>셀렉 결과</h1></div><span>선택한 사진 <strong>3장</strong></span></div>
      <div className="film-writer-toolbar"><ProjectAssetTabs projectId="landing-sample" status="editing" activeTab="selected" originalCount={10} selectedCount={3} /><div className="story-tools"><ProjectAssetToolbarButton><Copy size={14} />파일명 복사</ProjectAssetToolbarButton><ProjectAssetToolbarButton><Download size={14} />CSV</ProjectAssetToolbarButton></div></div>
      <div className="story-list-toolbar"><span><LayoutGrid size={16} /> 선택 사진 3장</span><span><Search size={14} /> 파일명 검색</span></div>
      <div className="story-workarea"><div ref={scrollRef} className="story-photo-list"><OriginalPhotoGallery photos={photos} scrollRef={scrollRef} viewMode="grid" variant="selection" readonly thumbQueue={queue} onPhotoClick={noop} getSecondaryText={photo => photo.id === REQUEST_ID ? COMMENT : ""} /></div>
      <aside className="story-inspector"><small>사진별 요청 확인</small><PhotoThumbnailFrame><img src={getSamplePhoto(REQUEST_ID).originalSrc} alt="ACUT_0001.jpg" /></PhotoThumbnailFrame><h2>ACUT_0001.jpg</h2><div className="story-rating">{[1,2,3,4,5].map(n=><Star key={n} size={13} fill={n <= RATINGS[REQUEST_ID] ? "currentColor" : "none"} />)}</div><PhotoCardComment comment={COMMENT} truncate={false} /></aside></div>
      <footer><span>선택한 사진과 고객 요청이 함께 정리됐어요.</span><Check size={16} /></footer></div>

    </section>

  </main>;
}
