"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, ListChecks } from "lucide-react";
import { getStatusLabel } from "@/lib/project-status";
import "./project-overview.css";

// 실제 대시보드의 우선 확인 카드 / 최근 프로젝트 구조를 샘플 데이터만으로 설명한다.
const FOCUS = [
  { name: "스튜디오 프로필", title: "재보정 요청이 도착했어요.", description: "고객이 남긴 요청을 확인하고 보정을 이어가세요.", status: "editing_v2" as const, metric: "재보정 요청", count: "2장", next: "요청 내용 확인", icon: RotateCcw },
  { name: "민서와 지훈의 스튜디오 스냅", title: "고객의 셀렉이 완료됐어요.", description: "선택된 사진을 확인하고 보정을 시작할 차례예요.", status: "confirmed" as const, metric: "선택한 사진", count: "4장", next: "선택 결과 확인", icon: ListChecks },
];
const RECENT = [
  {name:"민서와 지훈의 스튜디오 스냅",status:"confirmed" as const,actor:"작가 작업"},
  {name:"주말 가족 스냅",status:"selecting" as const,actor:"고객 응답 대기"},
  {name:"가을 커플 스냅",status:"delivered" as const,actor:"작업 마무리"},
];
export function ProjectOverview() {
  const [index, setIndex] = useState(0);
  const current = FOCUS[index];
  const Icon = current.icon;
  return <div className="po-shell" aria-label="작가 대시보드 샘플">
    <header className="po-header"><span>A-CUT <b>대시보드</b></span><small>샘플</small></header>
    <div className="po-body">
      <div className="po-section-heading"><strong>우선 확인할 프로젝트</strong><div className="po-navigation">
        <button type="button" disabled={index===0} onClick={()=>setIndex(index-1)} aria-label="이전 프로젝트 예시"><ArrowLeft size={15}/></button>
        <span>{index+1} / {FOCUS.length}</span>
        <button type="button" disabled={index===FOCUS.length-1} onClick={()=>setIndex(index+1)} aria-label="다음 프로젝트 예시"><ArrowRight size={15}/></button>
      </div></div>
      <div className="po-focus" aria-live="polite" aria-atomic="true">
        <span className="po-focus-label"><Icon size={14}/>작가가 이어갈 작업</span>
        <h3>{current.title}</h3><p>{current.description}</p>
        <div className="po-focus-detail"><div><strong>{current.name}</strong><small>{getStatusLabel(current.status)}</small></div><div className="po-metric"><small>{current.metric}</small><b>{current.count}</b></div></div>
        {/* 실제 프로젝트로 이동하는 CTA 대신 다음 작업을 설명한다. */}
        <div className="po-next"><span>다음 작업</span><strong>{current.next}</strong><ArrowRight size={14}/></div>
      </div>
      <div className="po-section-heading po-recent-heading"><strong>최근 프로젝트</strong><span>3건</span></div>
      <ul className="po-recent">{RECENT.map(project=><li key={project.name}><div><strong>{project.name}</strong><small>{project.actor}</small></div><span className="po-status" data-complete={project.status==="delivered"}>{project.status==="delivered"&&<Check size={11}/>} {getStatusLabel(project.status)}</span></li>)}</ul>
    </div>
  </div>;
}
