/* eslint-disable @next/next/no-img-element -- 제공된 로컬 샘플을 검수 시안에 표시한다. */
"use client";
import { useRef, useState, type ReactNode } from "react";
import { Check, Upload, Sparkles, ArrowRight, MousePointer2 } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { ProjectFormField, ProjectFormInput, ProjectShootTypeSelector, PROJECT_FORM_INPUT_CLASS } from "@/components/photographer/ProjectFormFields";
import { PhotoAnalysisFilterGroup } from "@/components/photographer/PhotoAnalysisFilterGroup";
import { OriginalPhotoGallery } from "@/components/photographer/OriginalPhotoGallery";
import UploadVersionsPanel from "@/components/photographer/UploadVersionsPanel";
import FinalDeliveryDownloadEntry from "@/components/customer/FinalDeliveryDownloadEntry";
import { PhotoCardComment } from "@/components/photographer/PhotoCardComment";
import { createThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo, PhotoGroupInfo } from "@/types";
import { getSamplePhoto, SAMPLE_PROJECT } from "../sample-project";
import { DemoCapture } from "../demo-capture/DemoCapture";
import { UploadStoryboard } from "../demo-capture/UploadStoryboard";
import { ReviewStoryboard } from "../demo-capture/ReviewStoryboard";
import "./support.css";
const noop = () => {};
const COMMENT = "얼굴 주변 잔머리만 자연스럽게 정리해주세요.";
const labels = ["A-CUT 소개", "프로젝트 생성 · 원본 업로드", "AI 검수 보조", "고객의 셀렉과 요청", "작가의 셀렉 결과 확인", "보정본 업로드", "원본·보정본 비교", "최종 납품 · 다운로드", "마무리"];
function Phone({children}:{children:ReactNode}) {
  // 첨부 목업의 금속 림·검은 베젤·캡슐 카메라·측면 버튼을 별도 요소로 구성한다.
  return <div className="support-phone"><i className="side-key key-left"/><i className="side-key key-right"/><div className="phone-bezel"><div className="phone-display">{children}</div></div><div className="phone-camera"><i/></div><div className="phone-shadow"/></div>;
}
function AiGallery() {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [queue]=useState(()=>createThumbLoadQueue(8));
  // 정지 시안의 판정 예시다. AI를 실행한 결과나 성능 측정으로 표현하지 않는다.
  const photos:Photo[]=[{id:"01",projectId:"landing-sample",orderIndex:0,url:getSamplePhoto("01").originalSrc,originalFilename:"ACUT_0001.jpg",similarityGroupId:"sample-group"},{id:"03",projectId:"landing-sample",orderIndex:1,url:getSamplePhoto("03").originalSrc,originalFilename:"ACUT_0003.jpg",faceDetected:true,eyesClosed:true},{id:"blur",projectId:"landing-sample",orderIndex:2,url:"/landing/sample-project/quality/motion-blur-01.jpg",originalFilename:"ACUT_0015.jpg",isBlurry:true}];
  const groups=new Map<string,PhotoGroupInfo>([["sample-group",{id:"sample-group",representativePhotoId:"01",photoCount:2}]]);
  return <div className="ai-workspace"><div className="product-bar"><BrandLogoBar variant="customerEntry"/><span>{SAMPLE_PROJECT.name} / 원본 업로드</span></div><div className="ai-heading"><h2>원본 사진</h2><button><Sparkles size={14}/> AI 분석</button></div><div className="ai-toolbar"><PhotoAnalysisFilterGroup similarity={{count:1,checked:true,onChange:noop}} eyesClosed={{count:1,checked:false,onChange:noop}} blurry={{count:1,checked:false,onChange:noop}}/></div><div className="ai-gallery" ref={scrollRef}><OriginalPhotoGallery photos={photos} scrollRef={scrollRef} thumbQueue={queue} viewMode="grid" onPhotoClick={noop} readonly showQualityBadges showSimilarityGroups groupsById={groups} minCols={3}/></div></div>;
}
export function ProductStoryboard({scene}:{scene:number}) {
  return <main id="support-film" className={`support-film scene-${scene}`} data-scene={scene}>
    <header className="support-header"><BrandLogoBar variant="customerEntry"/><span>{labels[scene-1]}</span></header>
    {scene===1&&<div className="intro-copy"><div className="intro-logo"><BrandLogoBar variant="customerEntry" size="lg"/></div><h1>원본 업로드부터 보정본 납품까지<br/>통합 처리하는<br/>온라인 사진 관리 서비스 A-CUT</h1><div className="intro-photos">{["01","06","10"].map(id=><div key={id}><img src={getSamplePhoto(id).originalSrc} alt="샘플 사진"/><span>{getSamplePhoto(id).filename}</span></div>)}</div><small>소개 문장 3 / 3 · 앞의 두 의미 단위 다음에 순차 표시</small></div>}
    {scene===2&&<><h1 className="support-title">프로젝트를 만들고, 원본을 끌어 놓습니다.</h1><section className="create-card"><h2>새 프로젝트 만들기</h2><ProjectFormField label="프로젝트명" required><ProjectFormInput className={PROJECT_FORM_INPUT_CLASS} value={SAMPLE_PROJECT.name} readOnly/></ProjectFormField><ProjectFormField label="촬영 유형"><ProjectShootTypeSelector value="etc" onChange={noop}/></ProjectFormField><div className="create-row"><ProjectFormField label="고객 이름" required><ProjectFormInput className={PROJECT_FORM_INPUT_CLASS} value="민서와 지훈" readOnly/></ProjectFormField><ProjectFormField label="촬영 일자" required><ProjectFormInput className={PROJECT_FORM_INPUT_CLASS} value="2026-09-01" readOnly/></ProjectFormField><ProjectFormField label="셀렉 갯수" required><ProjectFormInput className={PROJECT_FORM_INPUT_CLASS} value="3" readOnly/></ProjectFormField></div><button className="support-primary">생성 후 원본 업로드 <ArrowRight size={15}/></button></section><section className="original-card"><h2><Upload size={19}/> 원본 업로드</h2><p>여기에 파일을 놓으세요</p><div className="original-thumbs">{["01","02","06"].map(id=><img key={id} src={getSamplePhoto(id).originalSrc} alt="원본 샘플"/>)}</div><div className="drag-files"><img src={getSamplePhoto("01").originalSrc} alt="드래그 중인 원본"/><div><strong>ACUT_0001.jpg</strong><span>외 2개 파일</span></div><MousePointer2 size={25} fill="white"/></div><small>파일을 놓으면 업로드 준비로 이어집니다.</small></section></>}
    {scene===3&&<><h1 className="support-title">AI는 검수를 돕고, 최종 판단은 작가가.</h1><AiGallery/></>}
    {scene===4&&<><Phone><div className="customer-embed"><DemoCapture/></div></Phone><aside className="phone-copy"><p className="support-eyebrow">고객 링크에서</p><h1>사진을 고르고,<br/>사진에 요청을 남깁니다.</h1><div className="focus-photo"><img src={getSamplePhoto("01").originalSrc} alt="선택 사진"/><div><strong>ACUT_0001.jpg</strong><span><Check size={13}/> 선택됨 · 별점 4</span></div></div><PhotoCardComment comment={COMMENT} truncate={false}/><p className="step-note">사진 선택 → 요청 저장 → 셀렉 제출</p></aside></>}
    {scene===5&&<><h1 className="support-title">선택한 사진과 요청이 함께 정리됩니다.</h1><div className="writer-embed"><UploadStoryboard frameTime={13}/></div></>}
    {scene===6&&<><h1 className="support-title">보정본을 한 번에 올리면, 파일명으로 자동 매핑.</h1><p className="mapping-note">같은 파일명으로 원본과 연결 · 작가가 매칭 결과를 확인합니다.</p><UploadVersionsPanel isOpen onClose={noop} projectId="landing-sample" version={1} targets={["01","06","10"].map(id=>({id,filename:getSamplePhoto(id).filename,photo:{id,projectId:"landing-sample",orderIndex:Number(id),url:getSamplePhoto(id).originalSrc,originalFilename:getSamplePhoto(id).filename}}))} onDelivered={noop} onDeleteExisting={async()=>{}}/></>}
    {scene===7&&<><Phone><div className="review-embed"><ReviewStoryboard/></div></Phone><aside className="phone-copy"><p className="support-eyebrow">고객의 보정본 검토</p><h1>사진을 꾹 누르면 원본,<br/>손을 떼면 보정본.</h1><div className="compare-held"><img src={getSamplePhoto("01").originalSrc} alt="누르는 동안 보이는 원본"/><span className="held-badge">원본 보는 중</span><span className="held-point"><MousePointer2 size={28} fill="white"/></span></div><p className="compare-file">ACUT_0001.jpg · 같은 사진, 같은 위치에서 비교</p><p className="step-note">보정본 → 꾹 누르기 · 원본 → 손 떼기 · 보정본<br/>비교 후 확정 또는 재보정 요청</p></aside></>}
    {scene===8&&<><h1 className="support-title">최종 보정본을, 한 번에 다운로드.</h1><section className="delivery-preview"><FinalDeliveryDownloadEntry token="landing-sample"/></section></>}
    {scene===9&&<div className="end-copy"><BrandLogoBar variant="customerEntry" size="lg"/><h1>원본 업로드부터<br/>보정본 납품까지</h1><div className="end-line"/></div>}
    <footer className="support-footer"><span>{scene===3?"실제 UI · 샘플 판정 예시 (AI 실측 결과 아님)":"제품 시연 · 랜딩 전용 샘플 프로젝트"}</span><span>{scene} / 9 · 검수용 정지 시안</span></footer>
  </main>;
}
