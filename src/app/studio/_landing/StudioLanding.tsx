"use client";

/* eslint-disable @next/next/no-img-element -- 시안 그대로의 정적 샘플 사진 */
import Link from "next/link";
import { BusinessInfo } from "@/components/landing/BusinessInfo";
import { LandingAuth } from "@/components/landing/LandingAuth";
import { useRef, useState } from "react";
import { landingFontVars } from "@/lib/landing-fonts";
import { WORKSPACES } from "@/lib/workspaces";
import { useLandingAnimation } from "@/components/landing/use-landing-animation";
import { LandingPoster } from "@/components/landing/LandingPoster";
import "./studio-landing.css";

const loadMotion = () => import("./motion").then((module) => module.startStudioLanding);

const PIC = (n: string) => `/landing/studio/${n}.jpg`;

/** 링크 미리보기 카드 — 히어로와 마무리에 같은 카드가 나온다. 히어로 카드만 id를 달아 움직인다. "링크 공유"(제품 업로드 화면의 버튼 이름)는 아이콘만, 이름은 aria-label. */
function LinkCard({ hero }: { hero?: boolean }) {
  return <div className="lcard on" id={hero ? "pill" : undefined}><img src={PIC("p05")} alt="" loading={hero ? "eager" : "lazy"} /><div><b>민서 ♥ 지훈 커플 스냅</b><small>사진 812장 · 셀렉 기한 10월 23일 (금)</small><div className="u">acut.kr/c/minseo-jihun</div><span className="sent on" id={hero ? "sent" : undefined} aria-label="링크 공유"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg></span></div></div>;
}

/** 히어로 배경의 작가 업무 조각 — 시안과 같은 자리·흔들림 값(CSS 변수). 2.2초마다 차례로 선명해짐(motion.ts) */
const FRAGS: { cls: string; pos: string; ch: string; icon: string; sm?: string; tx: string }[] = [
  { cls: "tp", pos: "calc(50% - 560px)|24%|-4deg|13s|10px|-8px", ch: "k", icon: "톡", sm: "민서 신부님", tx: "2041, 2043, 2051, 2058…" },
  { cls: "tp", pos: "calc(50% + 290px)|20%|3deg|11s|-8px|10px", ch: "d", icon: "▲", sm: "드라이브", tx: "민서지훈_원본 · 812개" },
  { cls: "dk2", pos: "calc(50% - 590px)|49%|2deg|15s|8px|8px", ch: "m", icon: "메모", tx: "금요일까지 셀렉 받기" },
  { cls: "dk2", pos: "calc(50% + 330px)|47%|-3deg|12s|-10px|-6px", ch: "x", icon: "엑셀", tx: "셀렉_최종_진짜최종.xlsx" },
  { cls: "m1", pos: "calc(50% - 560px)|71%|3deg|14s|6px|-10px", ch: "s", icon: "문자", sm: "가을 커플 스냅", tx: "링크가 안 열려요…" },
  { cls: "m2", pos: "calc(50% + 290px)|75%|-2deg|10s|-6px|-8px", ch: "k", icon: "톡", sm: "수아 신부님", tx: "보정본 언제 받을 수 있을까요?" },
  { cls: "dk2 tall", pos: "calc(50% - 110px)|12%|-1deg|16s|10px|6px", ch: "e", icon: "메일", sm: "메일 · 첨부 5개", tx: "민서지훈_원본.part3.zip" },
];
const fragStyle = (pos: string) => { const [left, top, r, d, dx, dy] = pos.split("|"); return { left, top, "--r": r, "--d": d, "--dx": dx, "--dy": dy } as React.CSSProperties; };

/** 화면 구조와 문구는 design/landing-preview/studio 시안을 그대로 옮겼다. 움직임은 ./motion.ts. */
export function StudioLanding({ loggedIn, maxProjects, maxPhotos, betaMaxProjects, betaMaxPhotos }: { loggedIn: boolean; maxProjects: number; maxPhotos: number; betaMaxProjects: number; betaMaxPhotos: number }) {
  const root = useRef<HTMLDivElement>(null);
  const animated = useLandingAnimation(root, loadMotion);
  const [preview, setPreview] = useState<"rec" | "stack" | "quality" | "family">("rec");
  const start = loggedIn ? WORKSPACES.studio.path : `/login?next=${encodeURIComponent(WORKSPACES.studio.path)}`;
  const avatars = <span className="av"><i style={{ background: "var(--p1)" }}>민</i><i style={{ background: "var(--p2)" }}>지</i><i style={{ background: "var(--p3)" }}>엄</i></span>;

  // data-acut-light-canvas: html·body도 밝은 캔버스로(globals.css) — 전역 바탕이 다크라 러버밴드·로딩 순간에 검게 비침
  return <LandingAuth loggedIn={loggedIn}><div ref={root} data-acut-light-canvas data-landing-mode={animated ? "animated" : "static"} className={`stl ${landingFontVars}`}>
    <nav className="nav" aria-label="서비스 메뉴"><div className="in"><Link className="logo" href="/">A-CUT<i>.</i></Link><Link className="on" href="/studio" aria-current="page">작가·스튜디오</Link><Link className="hide-m" href="/select">내 사진 셀렉</Link><Link className="hide-m" href={loggedIn ? "/workspaces" : "/login"}>{loggedIn ? "내 작업" : "로그인"}</Link><Link className="btn o" href={start}>바로 체험하기</Link></div></nav>

    <section className="heroL" id="top" aria-label="히어로: 링크 하나로 보내고, 고르고, 확정하고, 전달까지">
      <div className="stage" id="lStage">
        {!animated && <LandingPoster name="studio-hero" alt="" eager className="landing-poster-bg"/>}
        <div className="top" id="lTop">
          <div className="eb">스냅 작가를 위한 셀렉</div>
          <h1 id="h1"><s id="strike">카톡·드라이브</s> 대신,<br /><em>A-CUT 링크 하나로.</em></h1>
          <p className="sub">원본 업로드부터 최종본 전달까지, 한곳에서 관리하세요.</p>
          <div className="lwrap"><LinkCard hero /></div>
          <div className="ctas"><Link className="btn o" href={start}>바로 체험하기</Link><Link className="btn w" href="/beta/apply" prefetch={false}>무료 베타 신청하기</Link></div>
          <div className="frags" id="frags" aria-hidden="true">{FRAGS.map((f, i) => <div key={f.tx} className={`frag ${f.cls}${i === 0 ? " s0" : i === FRAGS.length - 1 ? " s1" : i === FRAGS.length - 2 ? " s2" : ""}`} style={fragStyle(f.pos)}><i className={`ch-${f.ch}`}>{f.icon}</i><div>{f.sm && <small>{f.sm}</small>}{f.tx}</div></div>)}</div>
        </div>
        {animated && (<div className="scrollcue" id="cue" aria-hidden="true">스크롤하면 링크가 열려요 ↓</div>)}
        {animated && (<div className="gal" id="gal" aria-hidden="true">
          <div className="gcard" id="gcard"><LinkCard /></div>
          <div className="gbar"><img className="gth" src={PIC("p05")} alt="" /><b>민서 ♥ 지훈 커플 스냅</b><span className="m">812장 · 40장 고르기</span>{avatars}<span className="dl">셀렉 기한 D-3</span></div>
          <div className="ggrid" id="ggrid" />
          <div className="gcount" id="gcount">고객이 고르는 중 · <b>0</b> / 40장</div>
        </div>)}
        {animated && (<div className="gdim" id="gdim" aria-hidden="true" />)}
        {animated && (<div className="noti" id="noti" aria-hidden="true">
          <div className="who"><i>A</i>A-CUT<small>작가님 휴대폰 · 금 21:14</small></div>
          <div className="bub"><div className="hd">알림톡 도착</div><div className="bd"><b>민서 ♥ 지훈 셀렉이 완료됐어요</b><ul><li>최종 선택: 40장</li><li>함께 고른 사람: 민서 · 지훈 · 어머님</li><li>이제 보정을 시작하시면 돼요</li></ul><span className="btn2">고른 사진 보기</span></div></div>
        </div>)}
      </div>
    </section>

    <section className="board2" id="board2" aria-label="모든 촬영의 진행 단계와 기한을 한 화면에서 보는 장면">
      <div className="stage" id="bStage">
        <div className="ttl"><h2>모든 촬영의 진행과 기한,<br />한 화면에서.</h2><p>어느 촬영이 어디까지 왔는지, 어떤 기한이 다가오는지 놓치지 않게 보여 드려요.</p></div>
        {animated ? (<div className="bfit" id="bfit">
          <div className="btop"><div className="sum"><span className="w">기한 임박 <strong id="sW">0</strong></span><span className="d">기한 지남 <strong id="sD">0</strong></span></div></div>
          <div className="bhead"><span>프로젝트</span><span className="stp"><span>원본</span><span>셀렉</span><span>보정</span><span>1차 재보정</span><span>2차 재보정</span><span>납품</span></span><span>현재 상태</span><span>기한</span></div>
          <div id="bRows" />
          <div className="bnote" id="bNote">기한이 다가오면 <b>임박</b>, 지나면 <em>빨간색</em>으로 먼저 보여 드려요.</div>
        </div>) : (<LandingPoster name="studio-board" alt="촬영별 진행 단계와 셀렉·검토 기한을 한 화면에서 확인하는 예시" />)}
      </div>
    </section>

    <section className="ease" aria-label="고객의 셀렉 화면">
      <div className="wrap">
        <div className="grid">
          <div>
            <h2 className="sec-h">고객이 쉽게 고를수록,<br />셀렉은 빨리 끝나요.</h2>
            <p className="sec-p">작가님이 보낸 링크를 열면 고객은 이런 셀렉 화면을 받아요. 앱도 가입도 없이요.</p>
            <div className="flist" role="tablist" id="flist">
              <button type="button" role="tab" aria-selected={animated ? true : preview === "rec"} onClick={animated ? undefined : () => setPreview("rec")} data-s="rec" data-m="추천한 사진부터 고르기 시작해요."><b>작가 추천</b><span>먼저 보여주고 싶은 사진에 추천을 걸어 두면, 고객은 추천에서부터 고르기 시작해요.</span></button>
              <button type="button" role="tab" aria-selected={animated ? false : preview === "stack"} onClick={animated ? undefined : () => setPreview("stack")} data-s="stack" data-m="비슷한 컷은 묶어서 비교해요."><b>유사컷</b><span>연속으로 찍은 비슷한 컷은 한 묶음으로 모여서 하나씩 비교해요.</span></button>
              <button type="button" role="tab" aria-selected={animated ? false : preview === "quality"} onClick={animated ? undefined : () => setPreview("quality")} data-s="quality" data-m="흔들린·눈 감은 사진은 빼고 봐요."><b>흔들림·눈 감음 표시</b><span>흔들린 사진과 눈 감은 사진에 표시가 붙고, 빼고 볼 수 있어요.</span></button>
              <button type="button" role="tab" aria-selected={animated ? false : preview === "family"} onClick={animated ? undefined : () => setPreview("family")} data-s="family" data-m="가족이 각자 찜하고, 색으로 구분해요."><b>가족과 함께</b><span>가족이 같은 링크로 들어와 각자 찜하고, 누가 찜했는지 색으로 보여요.</span></button>
            </div>
            <p className="fdesc" id="fdesc" aria-live="polite" />
          </div>
          {animated ? (<div className="devwrap"><div className="device"><div className="device-frame"><div className="device-screen">
            <div className="cs" id="cs" data-s="rec">
              <div className="st"><span>9:41</span><span className="ic"><b /><i /></span></div>
              <div className="hd"><b>민서 ♥ 지훈 커플 스냅</b>{avatars}<span className="dd">D-3</span></div>
              <div className="chips" id="csChips"><span data-s="all">모두</span><span data-s="rec">작가 추천 6</span><span data-s="stack">비슷한 컷</span><span data-s="quality">흔들림·눈 감음</span><span data-s="family">찜</span></div>
              <div className="ban"><b>작가님이 추천한 사진 6장</b>마음에 들면 추천에서부터 시작해 보세요.<br /><em>이 추천으로 시작하기</em></div>
              <div className="cg" id="cg" />
              <div className="bb"><span style={{ all: "unset" }}><b>12</b> / 40장 골랐어요</span><span>확정하기</span></div>
            </div>
          </div></div><div className="device-header" /><div className="device-sensors" /><div className="device-btns" /><div className="device-power" /></div></div>) : (<LandingPoster name={`studio-phone-${preview}`} alt="작가가 공유한 고객 사진 셀렉 화면 예시" className="landing-poster-phone" />)}
        </div>
      </div>
    </section>

    <section className="next" id="flow" aria-label="셀렉이 끝난 다음">
      <div className="wrap">
        <h2 className="sec-h">셀렉이 끝난 다음도, 한곳에서.</h2>
        <p className="sec-p">보정본을 올리고, 확정받고, 전달까지 같은 링크에서.</p>
        <div className="steps3">
          <div className="s3"><div className="vis v1"><figure><img src={PIC("o-simple5")} alt="" loading="lazy" /><figcaption>원본</figcaption></figure><span className="arr">→</span><figure><img src={PIC("r-simple5")} alt="" loading="lazy" /><figcaption>보정본</figcaption></figure></div><span className="n">1</span><h3>보정본 올리기</h3><p>고른 사진의 보정본을 같은 프로젝트에 올려요.</p></div>
          <div className="s3"><div className="vis v2"><figure><img src={PIC("cer03")} alt="" loading="lazy" /><span className="ok">✓ 확정</span></figure><figure><img src={PIC("cer05")} alt="" loading="lazy" /><span className="rv">재보정 요청</span><figcaption>사유: 피부톤을 조금 더 밝게 해 주세요</figcaption></figure></div><span className="n">2</span><h3>고객 확정 · 재보정</h3><p><span className="dk">고객은 보정본마다 확정하거나, 사유를 적어 재보정을 요청해요. 정해 둔 횟수 안에서만요.</span><span className="mb">고객이 확정하거나 재보정을 요청해요.</span></p></div>
          <div className="s3"><div className="vis v3"><img src={PIC("flower2")} alt="" loading="lazy" /><img src={PIC("stair1")} alt="" loading="lazy" /><img src={PIC("cer07")} alt="" loading="lazy" /><span className="dl">최종본 40장 · 내려받기</span></div><span className="n">3</span><h3>최종본 전달</h3><p><span className="dk">고객은 같은 링크에서 최종본을 내려받아요. 완료 후 30일 동안 보관해요.</span><span className="mb">같은 링크에서 내려받아요 · 30일 보관</span></p></div>
        </div>
      </div>
    </section>

    <section className="use" id="use" aria-label="이용 안내와 자주 묻는 질문">
      <div className="wrap">
        <div className="trial-start">
          <h2 className="sec-h">다음 촬영으로, 무료로 시작해 보세요.</h2>
          <p className="trial-limits">프로젝트 {maxProjects.toLocaleString()}개 · 프로젝트당 최대 {maxPhotos.toLocaleString()}장</p>
          <p>승인 없이 바로 이용할 수 있어요.</p>
          <Link className="btn o" href={start}>바로 체험하기</Link>
        </div>
        <div className="box1">
          <h3>더 많은 촬영을 관리하고 싶다면</h3>
          <p className="beta-intro">무료 클로즈드 베타에 참여해 보세요.</p>
          <ul className="beta-benefits">
            <li>프로젝트 최대 <strong>{betaMaxProjects.toLocaleString()}개</strong></li>
            <li>프로젝트당 최대 <strong>{betaMaxPhotos.toLocaleString()}장</strong></li>
            <li><strong>AI 유사컷 분석</strong> 포함</li>
          </ul>
          <Link className="btn w" href="/beta/apply" prefetch={false}>무료 베타 신청하기</Link>
          <span className="beta-approval">신청 검토·승인 후 무료로 이용할 수 있어요.</span>
        </div>

        <h3 style={{ fontSize: 20, margin: "0 0 6px" }}>자주 묻는 질문</h3>
        <details><summary>고객도 가입해야 하나요?</summary><p>아니요. 받은 링크를 열면 바로 고를 수 있어요. PIN을 걸었다면 PIN만 입력하면 돼요.</p></details>
        <details><summary>고객이 기한을 넘기면 어떻게 되나요?</summary><p>대시보드의 &quot;기한 지난 고객&quot;에 따로 모여서, 연락이 필요한 촬영을 놓치지 않아요.</p></details>
        <details><summary>링크를 받은 사람만 볼 수 있나요?</summary><p>프로젝트에 4자리 PIN을 걸면, 링크와 PIN을 함께 받은 사람만 사진을 볼 수 있어요.</p></details>
        <details><summary>재보정은 몇 번까지 되나요?</summary><p>프로젝트마다 정해 둔 횟수 안에서 요청할 수 있어요. 고객은 보정본마다 확정하거나, 사유를 적어 재보정을 요청해요.</p></details>
        <details><summary>사진은 얼마나 보관되나요?</summary><p>모든 과정이 끝난 뒤 30일 동안 보관해요. 그동안 고객은 같은 링크에서 내려받을 수 있어요.</p></details>
        <details><summary>어떤 파일을 올릴 수 있나요?</summary><p>JPG, PNG, WebP, HEIC를 올릴 수 있어요. RAW는 아직 지원하지 않아요.</p></details>
        <details><summary>알림톡도 보내 주나요?</summary><p>네. 셀렉 기한이 다가오면 고객에게, 고객이 셀렉을 마치면 작가님께 알림톡이 가요.</p></details>
      </div>
    </section>

    <section className="final" aria-label="마무리">
      <div className="wrap">
        <div className="fcard"><LinkCard /></div>
        <h2>다음 촬영부터,<br />링크 하나로 시작하세요.</h2>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}><Link className="btn o" href={start}>바로 체험하기</Link><Link className="btn w" href="/beta/apply" prefetch={false}>무료 베타 신청하기</Link></div>
      </div>
    </section>
    <footer><BusinessInfo><Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link></BusinessInfo></footer>
  </div></LandingAuth>;
}
