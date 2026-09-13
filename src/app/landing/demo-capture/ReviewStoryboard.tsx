/* eslint-disable @next/next/no-img-element -- 제공 원본과 보정본을 정지 시안에 직접 표시한다. */
"use client";
import { useEffect, useState } from "react";
import { Check, RefreshCw, ArrowLeft, ArrowRight, MousePointer2 } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { getSamplePhoto } from "../sample-project";
import "./review-storyboard.css";

const REQUEST = "피부 톤을 조금 더 자연스럽게 조정해주세요.";
/** 03 영역 검토용 시안. 실제 리뷰 저장·제출 API를 호출하지 않는다. */
export function ReviewStoryboard() {
 const [time,setTime]=useState(0);
 useEffect(()=>{const w=window as unknown as {renderDemoFrame?:(t:number)=>void};w.renderDemoFrame=setTime;return()=>{delete w.renderDemoFrame;};},[]);
 // 원본을 2초씩 두 번 보여주고, 사이에 보정본으로 돌아와 비교를 반복한다.
 const original=(time>=1.5&&time<3.5)||(time>=4.5&&time<6.5), request=time>=8, saved=time>=10;
 const pulse=(start:number,end:number)=>Math.min(1,Math.max(0,(time-start)/0.18))*(1-Math.min(1,Math.max(0,(time-end)/0.18)));
 const blend=pulse(1.5,3.5)+pulse(4.5,6.5);
 const pointer=time>=1.1&&time<7;
 const photo=getSamplePhoto("10");
 return <main id="demo-film" className="review-board" data-time={time}>
  <div className="rb-phone"><header><BrandLogoBar variant="customerEntry"/><span>보정본 검토</span></header>
   <div className="rb-file"><ArrowLeft size={16}/><strong>ACUT_0010.jpg</strong><span>{original ? "원본" : "보정본"}</span></div>
   {/* 두 이미지를 같은 크기로 겹쳐 비교 시 레이아웃과 이미지 로딩이 바뀌지 않게 한다. */}
   <div className="rb-photo"><img src={photo.retouchedSrc} alt="보정본"/><img src={photo.originalSrc} alt="원본" style={{opacity:blend}}/></div>
   <button className="rb-compare" data-active={original}>{original ? "원본 보는 중 · 누른 상태" : "꾹 눌러 원본"}
    {pointer&&<span className="rb-press" data-held={original}><MousePointer2 size={25} fill="white"/></span>}
   </button>
   <div className="rb-panel"><div className="rb-actions">{saved ? <span className="rb-verdict"><RefreshCw size={14}/>재보정 요청됨</span> : <><button className={!request ? "rb-primary" : ""}><Check size={17}/>확정</button><button className={request ? "rb-active" : ""}><RefreshCw size={15}/>재보정 요청</button></>}</div>
    <label>재보정 요청 내용 {request&&<span>필수</span>}</label><div className="rb-input" data-active={request}>{request ? REQUEST : "재보정을 고르면 내용을 적을 수 있어요."}{request&&!saved&&<i/>}</div><small>{saved ? "사진별 요청이 저장됐어요." : request ? "입력 중" : ""}</small></div>
   <footer><span>ACUT_0010.jpg</span><span>{saved ? "재보정 요청" : "보정본 확인"}</span></footer>
  </div>
  <aside className="rb-story"><span className="rb-eyebrow">03 / 보정본 검토</span><h1>{original ? <>누르고 있는 동안,<br/>원본을 보여드려요.</> : request ? <>더 손볼 부분은,<br/>사진에 바로 남겨요.</> : <>보정본을 확인하고,<br/>원본과 비교해요.</>}</h1><p>{original ? "버튼을 누른 채 원본을 살펴보고,\n놓으면 보정본으로 돌아옵니다." : request ? "어떤 사진의 어떤 부분인지,\n설명을 다시 주고받을 필요 없이." : "같은 사진, 같은 위치에서\n보정 전후를 확인하세요."}</p>
   <div className="rb-steps">{["보정본 확인","원본과 비교","확정 또는 재보정 요청"].map((s,i)=><div data-active={i===(request?2:original?1:0)} key={s}><b>0{i+1}</b><span>{s}</span><ArrowRight size={17}/></div>)}</div>
   {request&&<blockquote><span>ACUT_0010.jpg · 재보정 요청</span><p>{REQUEST}</p>{saved&&<small><Check size={13}/>사진별 요청 저장</small>}</blockquote>}
  </aside>
 </main>;
}
