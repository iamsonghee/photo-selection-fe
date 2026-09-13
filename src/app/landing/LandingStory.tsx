"use client";
import { SentenceText } from "./SentenceText";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, X, Check, ChevronDown, Copy, Download, RotateCcw, Sparkles, Star, Users } from "lucide-react";
import "./story.css";
import { BenefitsScroll } from "./BenefitsScroll";
import { ProjectOverview } from "./ProjectOverview";
import { ReviewVideo } from "./ReviewVideo";
import { SamplePhoto } from "./SamplePhoto";
import { SAMPLE_PROJECT, SAMPLE_SELECTED_PHOTOS, getSamplePhoto, createSamplePhotoStates } from "./sample-project";

// 01 체험은 대표 10장만 사용한다. 두 쌍만 묶어 처음에는 8개 카드를 보여준다.
const PHOTO_IDS = ["01", "02", "03", "05", "06", "07", "14", "10", "11", "13"];
const PHOTO_GROUPS = [
  { group: "A", ids: ["01", "02"] }, { group: "single03", ids: ["03"] },
  { group: "C", ids: ["05", "06"] }, ...["07", "14", "10", "11", "13"].map(id => ({group:`single${id}`, ids:[id]})),
];
const groupFor = (id: string) => PHOTO_GROUPS.find(item => item.ids.includes(id))!;
const REQUIRED_COUNT = SAMPLE_PROJECT.requiredCount;
const filename = (id: string) => getSamplePhoto(id).filename;
type PhotoState = { selected: boolean; rating: number; comment: string; likes: string[] };
const initialPhotos = (): Record<string, PhotoState> => createSamplePhotoStates();

function BlankPhoto({ id, retouched = false }: { id: string; retouched?: boolean }) {
  return <div className="as-photo"><SamplePhoto id={id} retouched={retouched} /></div>;
}
function Heading({ step, title, children }: { step: string; title: string; children: string }) {
  return <div className="as-copy"><p className="as-kicker">{step}</p><h2>{title}</h2><p><SentenceText>{children}</SentenceText></p></div>;
}

export function LandingStory({ limits, onStart }: { limits: { generalMaxProjects: number; generalMaxPhotosPerProject: number; betaMaxProjectsTotal: number; betaMaxPhotosPerProject: number }; onStart: () => void }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [focus, setFocus] = useState("01");
  const detail = useRef<HTMLDialogElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // 네이티브 dialog가 포커스 격리·Esc·닫은 뒤 포커스 복원을 담당한다.
  useEffect(() => {
    if (!detailOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [detailOpen]);
  function openPhoto(id: string) { setFocus(id); setDetailOpen(true); detail.current?.showModal(); }
  function movePhoto(direction: number) { setFocus(previous => PHOTO_IDS[(PHOTO_IDS.indexOf(previous) + direction + PHOTO_IDS.length) % PHOTO_IDS.length]); }
  const [person, setPerson] = useState("민");
  const [grouped, setGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [copyCount, setCopyCount] = useState(0);
  const selected = PHOTO_IDS.filter((id) => photos[id].selected);
  // 02는 01 체험과 독립된 고정 결과 예시를 사용한다.
  const resultPhotos = SAMPLE_SELECTED_PHOTOS;
  const current = photos[focus];
  const visibleIds = grouped ? PHOTO_GROUPS.flatMap(({ group, ids }) =>
    expandedGroups.includes(group) ? ids : [ids.find((id) => photos[id].selected) ?? ids[0]]
  ) : PHOTO_IDS;
  function toggleGroup(group: string) {
    const ids = PHOTO_GROUPS.find((item) => item.group === group)!.ids;
    if (expandedGroups.includes(group) && ids.includes(focus)) {
      setFocus(ids.find((id) => photos[id].selected) ?? ids[0]);
    }
    setExpandedGroups((previous) => previous.includes(group) ? previous.filter((item) => item !== group) : [...previous, group]);
  }
  // 랜딩 전용 메모리 상태만 변경한다. 실제 고객 링크·API·스토리지에는 접근하지 않는다.
  function updatePhoto(id: string, change: Partial<PhotoState>) {
    if (submitted) return;
    setPhotos((previous) => ({ ...previous, [id]: { ...previous[id], ...change } }));
  }
  function toggleSelection(id: string) {
    if (submitted) return;
    if (!photos[id].selected && selected.length >= REQUIRED_COUNT) {
      setNotice("4장을 모두 골랐어요. 다른 사진으로 바꾸려면 먼저 선택을 해제해 주세요.");
      return;
    }
    updatePhoto(id, { selected: !photos[id].selected });
    setNotice("");
  }
  function reset() {
    setPhotos(initialPhotos()); setFocus("01"); setPerson("민"); setGrouped(true); setExpandedGroups([]);
    setSubmitted(false); setNotice("처음 상태로 돌아왔어요."); setExportNotice("");
  }
  function confirmSelection() {
    if (selected.length !== REQUIRED_COUNT || submitted) return;
    setSubmitted(true);
    setNotice("셀렉 체험을 완료했어요. 다시 체험하려면 처음부터 시작해 주세요.");
  }
  // 실제 복사는 콤마로 구분하고, 설명용 문서는 읽기 쉽게 한 줄에 한 파일을 표시한다.
  const copiedNames = resultPhotos.map((photo) => photo.filename).join(", ");
  async function copyNames() {
    try { await navigator.clipboard.writeText(copiedNames); setCopyCount(count => count + 1); setExportNotice("파일명을 콤마로 구분해 복사했어요."); }
    catch { setExportNotice("자동 복사가 제한됐어요. 아래 미리보기에서 파일명을 직접 선택해 복사해 주세요."); }
  }
  function downloadCsv() {
    // 입력한 코멘트를 CSV 셀로 이스케이프하고 스프레드시트 수식 실행을 방지한다.
    const cell = (value: string) => `"${(/^[=+@\-\t\r\n]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const csv = "\uFEFF파일명,코멘트\r\n" + resultPhotos.map((photo) => [photo.filename, photo.comment].map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "A-CUT_샘플_셀렉결과.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setExportNotice("샘플 CSV를 다운로드했어요.");
  }

  return <div className="as-story">
    <BenefitsScroll />

    <section id="selection-demo" className="as-section as-tinted" aria-labelledby="selection-title">
      <div className="ac-container">
        <Heading step="01 / 고객이 고르는 시간" title="함께 고르고, 선택은 또렷하게.">한 링크에서 각자의 이름으로 마음에 드는 사진을 표시하세요. 비슷한 컷을 모아 보고, 고른 사진에 요청을 남겨 작가에게 전달합니다.</Heading>
        <div className="as-demo">
          <header className="as-demo-bar"><span><span className="as-live-dot" /> 직접 해보는 고객 셀렉</span><button type="button" className="as-text-button" onClick={reset}><RotateCcw size={14} /> 처음부터</button></header>
          <div className="as-demo-intro"><div><h3 id="selection-title">{SAMPLE_PROJECT.name}</h3><p><SentenceText>{`${PHOTO_IDS.length}장의 사진을 살펴보고 마음에 드는 ${REQUIRED_COUNT}장을 골라보세요. 찜과 별점, 사진별 요청도 직접 남길 수 있어요.`}</SentenceText></p></div><span className="as-example-badge">체험용 프로젝트</span></div>
          <div className="as-selection-tools"><div className="as-person-picker" role="group" aria-label="찜하는 사람 바꾸기"><Users size={17} /><span>지금은</span>{["민", "지"].map((name) => <button key={name} type="button" disabled={submitted} aria-pressed={person === name} onClick={() => setPerson(name)}>{name}</button>)}<span>의 화면</span></div><button type="button" className="as-outline-button" aria-pressed={grouped} onClick={() => setGrouped(!grouped)}><Sparkles size={15} />{grouped ? "전체 사진 보기" : "유사컷 모아보기"}</button></div>
          <p className="as-inline-note">{grouped ? `대표 ${PHOTO_IDS.length}장 · 유사컷 두 쌍만 묶었어요. 묶음을 펼쳐 표정을 비교해 보세요.` : `대표 ${PHOTO_IDS.length}장을 모두 보고 있어요.`}</p>
          <div className="as-selection-layout"><div className={`as-photo-grid${grouped ? " is-grouped" : ""}`}>
            {visibleIds.map((id) => <div className={`as-photo-card${focus === id ? " is-focused" : ""}${grouped && groupFor(id).ids.length > 1 && !expandedGroups.includes(groupFor(id).group) ? " is-stack" : ""}`} key={id}>
              {grouped && groupFor(id).ids.length > 1 && <button type="button" className="as-group-label" aria-label={`유사컷 ${groupFor(id).group} ${expandedGroups.includes(groupFor(id).group) ? "접기" : "2장 펼치기"}`} aria-expanded={expandedGroups.includes(groupFor(id).group)} onClick={() => toggleGroup(groupFor(id).group)}><Sparkles size={12} />{expandedGroups.includes(groupFor(id).group) ? "접기" : "2장 펼치기"}<ChevronDown size={13} /></button>}
              <button type="button" className="as-photo-open" aria-label={`${filename(id)} 요청과 찜 보기`} aria-pressed={focus === id} onClick={() => openPhoto(id)}><BlankPhoto id={id} /></button>
              <label className="as-select-check"><input type="checkbox" checked={photos[id].selected} disabled={submitted} onChange={() => toggleSelection(id)} /><span>선택</span></label>
              <div className="as-card-meta"><span>{filename(id)}</span><span className="as-like-people">{photos[id].likes.map((name) => <i key={name} className={name === "지" ? "as-person-purple" : ""}>{name}</i>)}</span></div><div className="as-card-rating" role="group" aria-label={`${filename(id)} 별점`}>{[1,2,3,4,5].map(rating=><button key={rating} type="button" disabled={submitted} aria-label={`${filename(id)} ${rating}점`} aria-pressed={photos[id].rating===rating} onClick={()=>updatePhoto(id,{rating:photos[id].rating===rating?0:rating})}><Star size={16} fill={rating<=photos[id].rating?"currentColor":"none"}/></button>)}{photos[id].comment&&<button className="as-comment-link" type="button" onClick={()=>openPhoto(id)} aria-label={`${filename(id)} 요청 보기`}>요청</button>}</div>
            </div>)}
          </div></div>
          <dialog ref={detail} className="as-detail" aria-labelledby="detail-title" onClose={()=>setDetailOpen(false)} onClick={event=>{if(event.target===event.currentTarget) detail.current?.close();}} onKeyDown={event=>{
            if ((event.target as HTMLElement).closest("input,textarea,select")) return;
            if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();movePhoto(event.key==="ArrowLeft"?-1:1);}
          }}>
            <header className="as-detail-header"><div><span>사진 상세보기</span><strong id="detail-title">{filename(focus)}</strong></div><button type="button" aria-label="상세보기 닫기" onClick={()=>detail.current?.close()}><X size={22}/></button></header>
            <div className="as-detail-body"><div className="as-detail-image"><SamplePhoto id={focus} priority /></div><div className="as-inspector"><div className="as-inspector-heading"><span>지금 보고 있는 사진</span><strong>{filename(focus)}</strong></div><button type="button" className="as-outline-button" aria-pressed={current.likes.includes(person)} disabled={submitted} onClick={() => updatePhoto(focus, { likes: current.likes.includes(person) ? current.likes.filter((name) => name !== person) : [...current.likes, person] })}><Users size={16} />{person}의 찜 {current.likes.includes(person) ? "해제" : "남기기"}</button><fieldset disabled={submitted} className="as-rating"><legend>별점</legend>{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={current.rating === rating} onClick={() => updatePhoto(focus, { rating: current.rating === rating ? 0 : rating })}><Star size={22} fill={rating <= current.rating ? "currentColor" : "none"} /></button>)}</fieldset><label className="as-field">사진별 요청<textarea maxLength={300} rows={4} value={current.comment} disabled={submitted} onChange={(event) => updatePhoto(focus, { comment: event.target.value })} placeholder="이 사진에서 원하는 보정을 남겨보세요." /></label><p className="as-small">두 사람의 접속을 역할 전환으로 체험합니다. 실제 고객에게 전달되지 않아요.</p></div></div>
            <footer className="as-detail-footer"><button type="button" aria-label="이전 사진" onClick={()=>movePhoto(-1)}><ArrowLeft size={18}/></button><span>{PHOTO_IDS.indexOf(focus)+1} / {PHOTO_IDS.length}</span><button type="button" aria-label="다음 사진" onClick={()=>movePhoto(1)}><ArrowRight size={18}/></button><button type="button" className="ac-button" aria-pressed={current.selected} disabled={submitted} onClick={()=>toggleSelection(focus)}>{current.selected ? "선택 해제" : "이 사진 선택"}<Check size={16}/></button></footer>
            <p className="as-detail-status" role="status">{submitted ? "셀렉이 확정되어 내용을 변경할 수 없어요." : notice || "별점과 요청은 갤러리에도 반영됩니다."}</p>
          </dialog>
          <div className="as-demo-footer"><span><strong>{selected.length} / {REQUIRED_COUNT}장</strong> 선택{selected.length !== REQUIRED_COUNT && ` · ${REQUIRED_COUNT - selected.length}장을 더 골라주세요`}</span>{submitted ? <button type="button" className="ac-button" onClick={reset}>다시 체험하기<RotateCcw size={16} /></button> : <button type="button" className="ac-button" disabled={selected.length !== REQUIRED_COUNT} onClick={confirmSelection}>셀렉 확정하기<Check size={16} /></button>}</div>
          <p className="as-notice" role="status">{notice || "사진을 눌러 찜·별점·요청을 바꿔보세요."}</p>
        </div>
      </div>
    </section>

    <section id="results-demo" className="as-section ac-container as-split">
      <Heading step="02 / 작가가 이어받는 시간" title="선택한 파일명으로, 다음 작업을.">고객이 선택한 사진만 모아 확인하세요. 파일명을 복사하거나 요청이 담긴 목록을 내려받아, 익숙한 편집 도구에서 보정 작업을 이어가세요.</Heading>
<div className="as-results-media"><div className="as-demo">
        <header className="as-demo-bar"><span>작가의 셀렉 결과</span><span className="as-example-badge">샘플</span></header><div className="as-results-heading"><div><small>{SAMPLE_PROJECT.name}</small><strong>선택한 사진 <span>{resultPhotos.length}</span></strong></div><span><Check size={13}/>셀렉 완료</span></div>
        <div className="as-result-list">{resultPhotos.map((photo) => <article key={photo.id}><BlankPhoto id={photo.id} /><div><div className="as-result-file"><h3>{photo.filename}</h3></div><p className="as-result-request"><span>보정 요청</span>{photo.comment || "남긴 요청이 없어요."}</p></div><Check size={15} aria-label="선택된 사진" /></article>)}</div>
        <div className="as-export-actions"><button className="as-outline-button" type="button" onClick={copyNames}><Copy size={15} />파일명 복사</button><button className="as-outline-button" type="button" onClick={downloadCsv}><Download size={15} />요청 목록 다운로드</button></div>
        <p className="as-notice" role="status">{exportNotice || "파일명은 복사하고, 코멘트가 포함된 요청 목록은 CSV로 내려받으세요."}</p>
      </div>
      {/* 문서 미리보기이며 메모장 실행이나 텍스트 파일 다운로드를 흉내 내지 않는다. */}
      <aside className="as-name-document" aria-label="파일명 목록 샘플" key={copyCount} data-copied={copyCount > 0}>
        <header><span><Copy size={14}/>복사한 파일명</span><small>{copyCount > 0 ? "복사 완료" : "예시"}</small></header>
        <div className="as-name-document-body"><code>{resultPhotos.map(photo => photo.filename).join("\n")}</code></div>
      </aside></div>
    </section>

    <section id="review-demo" className="as-section as-tinted"><div className="ac-container">
      <Heading step="03 / 함께 마무리하는 시간" title="보정본 검토부터 확정까지.">작가가 직접 보정한 파일을 올리면 고객이 검토합니다. 사진별 판단을 모두 마친 뒤 결과를 제출하면, 다시 손볼 사진이 구분됩니다.</Heading>
      {/* 영상 자체로 검토 흐름을 설명하며 다른 체험의 완료 상태에 의존하지 않는다. */}
      <ReviewVideo />
    </div></section>

    <section id="projects-demo" className="as-section ac-container as-split"><Heading step="04 / 다음 작업을 놓치지 않도록" title="지금 이어갈 작업을 한눈에.">고객을 기다리는 촬영과 작가가 처리할 촬영을 구분하세요. 우선 확인할 프로젝트부터 살펴보고, 다음 작업을 이어가세요.</Heading><ProjectOverview /></section>

    <section id="landing-plans" className="as-section ac-container"><Heading step="다음 촬영에서 시작해 보세요" title="다음 촬영도 A-CUT으로.">무료 체험으로 고객 셀렉을 경험해 보세요. 더 많은 사진을 관리하려면 클로즈드 베타에 신청하세요.</Heading><div className="as-plans"><article><span className="as-kicker">바로 시작</span><h3>무료 체험</h3><p>프로젝트 <strong>{limits.generalMaxProjects}개</strong><br />프로젝트당 최대 <strong>{limits.generalMaxPhotosPerProject.toLocaleString()}장</strong></p><button type="button" className="ac-button" onClick={onStart}>무료 시작하기<ArrowRight size={16} /></button></article><article><span className="as-kicker">승인 후 참여</span><h3>클로즈드 베타</h3><p>프로젝트 <strong>{limits.betaMaxProjectsTotal}개</strong><br />프로젝트당 최대 <strong>{limits.betaMaxPhotosPerProject.toLocaleString()}장</strong><br />AI 유사컷 분석</p><Link prefetch={false} href="/beta/apply" className="as-outline-button">베타 신청하기<ArrowRight size={16} /></Link></article></div><p className="as-footnote"><SentenceText>화면의 이용 조건은 랜딩 검토용 가상 수치입니다. 실제 서비스 정책과 다를 수 있습니다.</SentenceText></p>
      <div className="as-faq"><h3>시작 전에 궁금한 점</h3>{[["고객도 가입하거나 앱을 설치해야 하나요?", "고객은 공유받은 링크를 브라우저에서 열면 됩니다. 비밀번호가 설정된 프로젝트는 비밀번호를 입력해 접속합니다."], ["여러 사람이 같이 사진을 고를 수 있나요?", "같은 링크에 접속해 이름과 색으로 각자의 찜을 구분할 수 있습니다. 찜과 최종 선택은 별개이며, 정해진 장수를 선택한 뒤 셀렉을 확정합니다."], ["AI가 사진을 보정해 주나요?", "AI 유사컷 분석은 비슷한 사진을 묶어 비교를 돕는 기능입니다. 보정은 작가가 기존 편집 도구에서 직접 작업하고, 완성한 보정본을 A-CUT에 올립니다."], ["기존 편집 도구에서는 어떻게 이어가나요?", "선택 결과에서 파일명을 복사하거나 파일명과 코멘트가 담긴 CSV를 내려받을 수 있습니다. 이를 참고해 기존 편집 도구에서 보정 대상을 찾으세요. 자동 동기화 기능은 아닙니다."], ["보정 요청은 몇 번까지 할 수 있나요?", "프로젝트에 설정한 재보정 횟수 안에서 요청할 수 있습니다. 고객은 사진별로 확정하거나 재보정 사유를 남길 수 있습니다."], ["사진 보관과 다운로드 기간은 어떻게 되나요?", "다운로드 가능 기간은 프로젝트의 다운로드 화면에서 확인하세요. 사진 보관 기간과 다운로드 만료는 서로 다르며, 상세 운영 정책은 별도 안내 예정입니다."]].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p><SentenceText>{answer}</SentenceText></p></details>)}</div>
      <div className="as-final"><h2>사진 셀렉, A-CUT으로 시작하세요.</h2><button type="button" className="ac-button" onClick={onStart}>무료 시작하기<ArrowRight size={17} /></button></div>
    </section>
  </div>;
}
