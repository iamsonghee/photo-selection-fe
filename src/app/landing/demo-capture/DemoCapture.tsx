/* eslint-disable @next/next/no-img-element -- 로컬 녹화 프레임은 원본 자산을 직접 디코딩한다. */
"use client";

import { useEffect, useState } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { GalleryPhotoCard } from "@/components/customer/GalleryPhotoCard";
import { BrandLogoBar } from "@/components/BrandLogo";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import { getSamplePhoto, SAMPLE_PROJECT } from "../sample-project";
import { UploadStoryboard } from "./UploadStoryboard";
import "./capture.css";
import "./storyboard.css";
import "./film.css";

const IDS = ["01", "02", "05", "06", "10", "03", "04", "07", "08", "09"];
const PICKS = ["01", "06", "10"];
const COMMENT = "얼굴 주변 잔머리만 자연스럽게 정리해주세요.";
const RATINGS = { "01": 4, "06": 5, "10": 5 } as const;
const REQUEST_ID = "01";
const noop = () => {};

export function DemoCapture() {
  const [time, setTime] = useState(0);
  const [queue] = useState(() => createThumbLoadQueue(20));
  // 녹화 스크립트가 프레임 시간을 직접 주입한다. API·실시간 타이머·운영 데이터는 사용하지 않는다.
  useEffect(() => {
    const target = window as unknown as { renderDemoFrame?: (seconds: number) => void };
    target.renderDemoFrame = setTime;
    return () => { delete target.renderDemoFrame; };
  }, []);
  const count = time >= 4.5 ? 3 : time >= 3.5 ? 2 : time >= 2.5 ? 1 : 0;
  const smooth = (p: number) => { const n = Math.max(0, Math.min(1, p)); return n * n * (3 - 2 * n); };
  const writerOpacity = smooth((time - 12) / .6) * (1 - smooth((time - 19.3) / .7));
  const end = time >= 19.3;
  const detail = time >= 5.5 && time < 9.8;
  const opening = smooth((time - 5.5) / .5);
  const closing = 1 - smooth((time - 9.5) / .3);
  // 썸네일과 같은 사진을 같은 위치에서 확대한다. 사진 교체 없이 상세 화면으로 연결한다.
  const morph = time >= 5.5 && time < 6;
  const commentText = time < 6.6 ? "" : time < 7.1 ? "얼굴 주변 잔머리만" : time < 7.6 ? "얼굴 주변 잔머리만 자연스럽게" : COMMENT;
  const editing = time >= 6.4 && time < 8.6;
  // 선택 터치 위치는 0005/0006 교환 후 2열 갤러리 위치에 맞춘다.
  const tap = [[2.5, 27, 129], [3.5, 189, 265], [4.5, 27, 401], [5.4, 85, 177], [6.4, 135, 421], [10.1, 255, 561], [11.1, 246, 347]]
    .find(([at]) => time >= at && time < at + .3);
  return <main id="demo-film" className="film-storyboard film-final" aria-label="A-CUT 제품 시연" data-time={time}>
    <div className="film-customer-scene">
    <aside className="film-context"><span>고객의 셀렉</span><h1>받은 링크에서,<br />편한 시간에 골라요.</h1><p>사진을 고르고, 사진별 요청을 남기면<br />작가에게 한 번에 전달됩니다.</p><div className="film-picked">{PICKS.map((id, index) => <div key={id} data-selected={!end && count > index}><img src={getSamplePhoto(id).originalSrc} alt="" /><span>{getSamplePhoto(id).filename}</span>{!end && count > index && <Check size={18} />}</div>)}</div><small>{detail ? (time >= 7.6 ? COMMENT : "선택한 사진에 요청을 남겨요.") : time >= 11.3 && !end ? "선택한 사진 3장과 요청을 전달했어요." : "선택한 사진과 요청이 함께 전달돼요."}</small></aside>
    <section className="film-screen film-customer">
      <header><BrandLogoBar variant="customerEntry" /><strong>{SAMPLE_PROJECT.name}</strong></header>
      <div className="film-toolbar"><strong>전체 사진 <small>10</small></strong><span>마음에 드는 사진 3장을 선택해 주세요.</span></div>
      <div className="film-gallery">{IDS.map((id, index) => { const sample = getSamplePhoto(id); return <GalleryPhotoCard key={id} token="landing-sample" photo={{ id, projectId: "landing-sample", orderIndex: index, url: sample.originalSrc, originalFilename: sample.filename }} selected={!end && PICKS.slice(0, count).includes(id)} rating={RATINGS[id as keyof typeof RATINGS]} hasComment={!end && time >= 8.6 && id === REQUEST_ID} showGroupBadge={false} restCount={0} totalCount={1} selectedCount={0} isGroupExpanded={false} presignedThumb={sample.originalSrc} thumbQueue={queue} viewerQueryString="" density={2} showFilename onPhotoClick={(e) => e.preventDefault()} onCheckClick={(e) => e.preventDefault()} onGroupBadgeClick={(e) => e.preventDefault()} onRate={noop} onThumbError={noop} />; })}</div>
      <footer><span>선택 <strong>{end ? 0 : count} / 3장</strong></span><button>{!end && time >= 11.3 ? <><Check size={18} />셀렉 제출 완료</> : "셀렉 확정하기"}</button></footer>
      {detail && <div className="film-detail" style={{ opacity: opening * closing }}>
        <div className="story-detail-heading"><ArrowLeft size={17} /><strong>ACUT_0001.jpg</strong><span><Check size={13} /> 선택됨</span></div>
        <div className="story-detail-photo" style={{ opacity: morph ? 0 : 1 }}><img src={getSamplePhoto(REQUEST_ID).originalSrc} alt="ACUT_0001.jpg" /></div>
        <aside><div className="story-comment-label"><label>사진별 코멘트</label><span>이 사진에만 남기는 요청</span></div>
          <div className="film-comment" data-editing={editing}>{commentText}{editing && <i className="story-caret" style={{ opacity: Math.floor(time * 3) % 2 ? 1 : .25 }} />}</div>
          <p className="story-saved">{time >= 8.6 ? <><Check size={12} /> 저장됨</> : editing ? "입력 중" : ""}</p>
        </aside></div>}

    {morph && <img className="film-morph-photo" src={getSamplePhoto(REQUEST_ID).originalSrc} alt="" style={{ left: 12 * (1-opening), top: 116 - 16 * opening, width: 154 + 186 * opening, height: 128 + 119 * opening, borderRadius: 4 * (1-opening) }} />}
    {time >= 10.3 && time < 11.3 && <SelectionConfirmDialog count={3} confirming={false} onCancel={noop} onConfirm={noop} />}
    {tap && <span className="film-tap" style={{ left: tap[1], top: tap[2], opacity: 1 - (time - tap[0]) / .3, transform: `translate(-50%,-50%) scale(${1 + (time - tap[0]) * 2})` }} />}
    </section></div>
    {/* 시안과 같은 작가 화면을 재사용하고 마지막 0.7초를 첫 화면으로 연결한다. */}
    <div className="film-writer-sequence" style={{ position: "absolute", inset: 0, opacity: writerOpacity, pointerEvents: "none" }}><UploadStoryboard frameTime={time} /></div>
    <img src={getSamplePhoto("01").retouchedSrc} alt="" style={{ display: "none" }} />

  </main>;
}
