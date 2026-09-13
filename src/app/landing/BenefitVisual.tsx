import { ArrowDown, Check, Download, FolderOpen, Link2, CalendarDays, Clock3, Layers, SlidersHorizontal } from "lucide-react";
import { SamplePhoto } from "./SamplePhoto";

/** 기능 설명용 로컬 샘플. 업로드·다운로드·AI API를 실행하는 조작 UI가 아니다. */
export function BenefitVisual({ index }: { index: number }) {
  if (index === 0) return <div className="bv-visual bv-ai" role="img" aria-label="유사한 사진 두 장을 묶어 비교하고 눈감음과 흔들린 사진 샘플을 함께 확인하는 예시">
    <div className="bv-bar"><span><SlidersHorizontal size={14}/>사진 살펴보기</span><small>샘플</small></div>
    <div className="bv-filters"><span className="bv-active">유사컷 묶음</span><span>눈감음</span><span>흐림·흔들림</span></div>
    <div className="bv-photos"><div className="bv-pair"><div className="bv-photo"><SamplePhoto id="01"/></div><div className="bv-photo"><SamplePhoto id="02"/></div><span><Layers size={12}/>유사컷 2장 · 표정 비교</span></div><div className="bv-single"><div className="bv-photo"><SamplePhoto id="03"/></div><span>눈감음 확인</span></div><div className="bv-single bv-blur"><div className="bv-photo">
      {/* 사용자 제공 흔들림 샘플을 그대로 사용하며 인위적인 blur 효과는 적용하지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/sample-project/quality/motion-blur-01.jpg" width={843} height={1264} alt="움직임으로 흔들린 커플 사진 샘플" loading="lazy" decoding="async"/>
    </div><span>흐림·흔들림 확인</span></div></div>
  </div>;
  if (index === 1) return <div className="bv-visual bv-delivery" role="img" aria-label="프로젝트에 올린 원본 사진을 공유 링크로 고객에게 전달하고 고객이 다운로드하는 예시">
    <div className="bv-bar"><span><FolderOpen size={14}/>스튜디오 스냅 · 원본</span><small>샘플</small></div>
    <div className="bv-file"><div className="bv-thumb"><SamplePhoto id="01"/></div><div><strong>촬영 원본 사진</strong><small>사진 10장 · 업로드 완료</small></div><Check size={16}/></div>
    <div className="bv-route"><span><Link2 size={13}/>공유 링크</span><ArrowDown size={16}/><span>고객</span></div>
    <div className="bv-download"><Download size={17}/><strong>원본 사진 다운로드</strong><span>10장</span></div>
  </div>;
  return <div className="bv-visual bv-deadline" role="img" aria-label="셀렉 마감 3일 전인 프로젝트의 기한과 고객 선택 진행 상태를 확인하는 예시">
    <div className="bv-bar"><span><CalendarDays size={14}/>셀렉 일정</span><small>샘플</small></div>
    <div className="bv-date"><div><small>고객 셀렉 마감</small><strong>9월 18일</strong></div><span>D−3</span></div>
    <div className="bv-week">{["월","화","수","목","금","토","일"].map((day,i)=><div className={i===4?"bv-due":i===1?"bv-today":""} key={day}><small>{day}</small><strong>{14+i}</strong><span>{i===1?"오늘":i===4?"마감":" "}</span></div>)}</div>
    <div className="bv-progress"><span><Clock3 size={14}/>고객 셀렉 중</span><small>선택 진행 3 / 4장</small></div>
  </div>;
}
