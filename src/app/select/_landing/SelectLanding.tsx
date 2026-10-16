"use client";

/* eslint-disable @next/next/no-img-element -- 시안 그대로의 정적 샘플 사진 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { landingFontVars } from "@/lib/landing-fonts";
import { WORKSPACES } from "@/lib/workspaces";
import { startSelectLanding } from "./motion";
import "./select-landing.css";

const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;

/** 화면 구조와 문구는 design/landing-preview/select 시안을 그대로 옮겼다. 움직임은 ./motion.ts. */
export function SelectLanding({ loggedIn, retentionDays }: { loggedIn: boolean; retentionDays: number }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => startSelectLanding(root.current!), []);
  const start = loggedIn ? WORKSPACES.select.path : `/login?next=${encodeURIComponent(WORKSPACES.select.path)}`;
  const guest = loggedIn ? "/select/new/guest" : `/login?next=${encodeURIComponent("/select/new/guest")}`;

  // data-acut-light-canvas: html·body도 밝은 캔버스로(globals.css) — 전역 바탕이 다크라 러버밴드·로딩 순간에 검게 비침
  return <div ref={root} data-acut-light-canvas className={`sl ${landingFontVars}`}>
    <nav className="nav" aria-label="서비스 메뉴"><div className="in"><Link className="logo" href="/">A-CUT<i>.</i></Link><Link className="hide-m" href="/studio">작가·스튜디오</Link><Link className="on" href="/select" aria-current="page">내 사진 셀렉</Link><Link className="hide-m" href={loggedIn ? "/workspaces" : "/login"}>{loggedIn ? "내 작업" : "로그인"}</Link><Link className="btn o" href={start}>시작하기</Link></div></nav>

    <section className="heroS" id="top" aria-label="히어로: 수천 장이 장면별로 정리되는 장면">
      <div className="stage" id="sStage">
        <div className="sprog" aria-hidden="true"><i /><i /><i /></div>
        <div className="heads">
          <div className="head on" data-h="0">
            <h1>결혼식 사진 수천 장,<br /><em>고르기 쉽게</em> 정리해 드려요.</h1>
            <p className="sub">촬영 흐름대로 장면을 나누고, 비슷한 컷은 묶고, 흔들린 사진은 빼고 볼 수 있어요.</p>
            <div className="ctas"><Link className="btn o" href={start}>내 사진 셀렉 시작하기</Link></div>
          </div>
          <div className="head" data-h="1"><h2>장면별로<br /><em>나눠 드렸어요.</em></h2><p className="sub">촬영 흐름대로 나눈 장면을, 한 번에 하나씩 보면 돼요.</p></div>
          <div className="head" data-h="2"><h2>장면마다 몇 장씩,<br /><em>40장</em>이 모였어요.</h2><p className="sub">고른 사진은 파일명과 함께 링크 하나로 작가님께 보내요.</p></div>
        </div>
        <div id="sTiles" />
        <div className="msgcard" id="msgcard"><span className="app"><i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4C6.5 4 2 7.5 2 11.8c0 2.8 1.9 5.2 4.7 6.6L5.8 22l4.1-2.7c.7.1 1.4.2 2.1.2 5.5 0 10-3.5 10-7.8S17.5 4 12 4z" /></svg></i>카카오톡<small>오후 3:12</small></span><b>본식 스냅 작가님</b>원본 2,860장 전달드립니다.<br />2주 안에 40장 골라서 파일명 보내주세요 :)</div>
        <div className="cnt" id="cnt">받은 사진 <b>2,860</b>장</div>
        <div className="sendp" id="sendp">작가님께 보내기 · 40장 · 파일명 포함</div>
      </div>
    </section>

    <section className="upl" aria-label="올리기">
      <div className="wrap">
        <p className="num" id="upNum">0<small>장</small></p>
        <div className="bar"><span id="upBar" /></div>
        <p className="upst" id="upSt">올리는 중…</p>
        <span className="aibtn" id="aiBtn" aria-hidden="true">AI로 정리하고 고르기 →</span>
        <h2>올리자마자, <span style={{ whiteSpace: "nowrap" }}>A-CUT이</span> 셀렉을 도와요.</h2>
        <p className="upd">버튼 하나로 비슷한 컷을 묶고, 장면을 나눠 드려요.</p>
        <ul className="chk" id="chk">
          <li data-n="438" data-u="묶음"><span className="ic">{CHECK}</span><span className="lb">비슷한 컷 묶기</span><span className="ld" /><span className="n">0<small>묶음</small></span><span className="cut" id="cut">넘겨볼 사진 <s>2,860장</s> → <b id="cutN">2,860</b>장</span></li>
          <li data-n="5" data-u="개"><span className="ic">{CHECK}</span><span className="lb">장면 나누고 이름 붙이기</span><span className="ld" /><span className="n">0<small>개</small></span><span className="sc"><span>본식</span><span>플라워 포토월</span><span>캔들 테이블</span><span>스튜디오</span><span>계단·창가</span></span></li>
        </ul>
        <span className="done" id="upDone">✓ 정리 완료</span>
      </div>
    </section>

    <section className="inscene" id="how" aria-label="한 장면 안에서 고르기">
      <div className="wrap grid">
        <div>
          <h2 className="sec-h" style={{ fontSize: "clamp(26px,3.4vw,38px)" }}>비슷한 사진은 한 묶음으로,<br />고르기 쉽게 모아 드려요.</h2>
          <p className="sec-p" style={{ fontSize: "15.5px" }}>연속으로 찍은 비슷한 사진을 한 묶음으로 모아 둬요. 펼쳐서 나란히 비교하고, 마음에 드는 사진만 고르세요.</p>
          <ul>
            <li><i>⧉</i>펼쳐서 나란히 비교해요</li>
            <li><i>✕</i>흔들린 사진은 빼고 볼 수 있어요</li>
            <li><i>5</i>장면마다 몇 장 골랐는지 보여요</li>
          </ul>
        </div>
        <div className="sview">
          <div className="top"><b>스튜디오</b><small>520장</small><span className="cnt2" id="sCnt">이 장면에서 5장 골랐어요</span></div>
          <div className="sbody" id="sBody">
            <div className="sw" id="swRow"><button type="button" role="switch" aria-checked="false" id="blurSw" aria-label="흔들린 사진·눈 감은 사진 빼고 보기" /><span id="swTxt">흔들린 사진·눈 감은 사진 빼고 보기</span></div>
            <div className="sgrid" id="sGrid" />
            <div className="simi" id="simi"><div className="h"><button type="button" id="simiClose">← 장면으로</button><span>⧉ 비슷한 사진 5장</span></div><div className="row" id="simiRow" /><div className="msg" id="simiMsg">마음에 드는 사진을 눌러 보세요. 여러 장 골라도 돼요.</div></div>
          </div>
        </div>
      </div>
    </section>

    <section className="together" aria-label="가족과 함께 고르기">
      <div className="wrap grid">
        <div>
          <h2 className="sec-h">본식 원본,<br />가족이랑 같이 고르세요.</h2>
          <p className="sec-p">초대 링크를 보내면 가족은 가입 없이 이름만 적고 들어와요. 나를 포함해 최대 5명이 각자 찜하고, 찜이 많은 사진부터 모아 봐요.</p>
          <ul>
            <li><i>♥</i>각자 찜하면, 찜이 많은 사진부터 위로</li>
            <li><i>✓</i>최종 선택은 내가 정해요</li>
            <li><i>…</i>같이 보는 동안 짧은 말도 주고받아요</li>
          </ul>
        </div>
        <div>
          <div className="devwrap"><div className="device"><div className="device-frame"><div className="device-screen" id="scr">
            <div className="st"><span>9:41</span><span className="ic"><b /><i /></span></div>
            <div className="ap"><span className="back">‹</span><b>민서 ♥ 지훈 본식</b><span className="with"><span className="av"><i style={{ background: "var(--p1)" }}>나</i><i style={{ background: "var(--p2)" }}>지</i><i style={{ background: "var(--p3)" }}>엄</i></span>함께 3</span></div>
            <div className="tabs3" role="tablist" id="tabs3"><button role="tab" aria-selected="false" data-v="all">모두</button><button role="tab" aria-selected="true" data-v="like">♥ 찜</button><button role="tab" aria-selected="false" data-v="pick">✓ 최종 선택</button></div>
            <div className="pg" id="pg" />
            <div className="talkb" id="talkb"><b>엄마</b>이거 액자로 하자!</div>
            <div className="bb"><div><b id="bbN">지금까지 12장 골랐어요</b><small>40장 정도 골라주세요</small></div><span>선택 완료 →</span></div>
          </div></div><div className="device-stripe" /><div className="device-header" /><div className="device-sensors" /><div className="device-btns" /><div className="device-power" /></div></div>
          <div className="phone-cap">위 탭을 눌러 보세요 · 찜이 많은 사진부터 보여요</div>
        </div>
      </div>
    </section>

    <section className="sendcmp" aria-label="작가님께 보내고 보정본 비교하기">
      <div className="wrap">
        <div className="row">
          <div className="txt">
            <div className="eb">다 골랐다면</div>
            <h2>파일명 하나하나<br />적어 보내지 마세요.</h2>
            <p><span className="dk">고른 사진은 링크 하나로 작가님께 보내요. 작가님은 가입 없이 고른 사진과 파일명, 메모를 확인해요. 다시 고르면 같은 링크에 바로 반영돼요.</span><span className="mb">고른 사진은 링크 하나로 작가님께 보내요.</span></p>
          </div>
          <div className="sendvis" id="sendVis">
            <div className="ptabs" aria-hidden="true"><span className="pt on" id="ptA">지금까지</span><span className="pt" id="ptB">A-CUT에서는</span></div>
            <div className="stg stA" id="stA">
              <div className="chatw"><div className="top">작가님 (본식 스냅)</div><div className="body"><div className="bub">원본 전달드렸어요. 40장 골라서 파일명 보내주세요 :)</div></div><div className="inp" id="inp"><span id="inpT" /><span className="cr" /></div><div className="cnt3" id="cnt3">0 / 40개 입력 중…</div></div>
              <div className="stamp" id="stamp">이제 이렇게 안 해도 돼요</div>
            </div>
            <div className="stg stB" id="stB">
              <div className="lcard"><div className="h"><i>A</i><div><b>작가님께 보내기</b><small>민서 ♥ 지훈 · 40장 · 파일명·메모 포함</small></div></div><div className="lk">acut.kr/r/minseo-jihun<span>보내기</span></div></div>
              <div className="pview"><div className="k">작가님 화면 · 로그인 없이</div><ul><li>ACUT_2043.jpg<em>메모: 피부톤 밝게</em></li><li>ACUT_2058.jpg</li><li>ACUT_2117.jpg<em>메모: 뒤 사람 지워주세요</em></li><li>… 37장 더</li></ul></div>
            </div>
            <div className="shut t" /><div className="shut b" />
            <button type="button" className="replay2" id="replay2">다시 보기</button>
          </div>
        </div>
        <div className="weeks">몇 주 뒤, 보정본이 도착하면</div>
        <div className="row b">
          <div className="cmpbig">
            <div className="hold2" id="hold2" role="button" tabIndex={0} aria-label="누르고 있는 동안 원본 보기"><img src="/landing/select/r-simple5.jpg" alt="보정본" /><img className="orig" src="/landing/select/o-simple5.jpg" alt="원본" /><span className="lab" id="h2lab">보정본</span><span className="hint">누르고 있으면 원본</span></div>
            <div className="arrive"><b>보정본 38 / 40장 도착</b><span>2장은 아직이에요</span></div>
          </div>
          <div className="txt">
            <div className="eb">보정본 확인</div>
            <h2>보정본이 오면,<br />원본과 나란히.</h2>
            <p><span className="dk">받은 보정본을 올리면 같은 파일명의 원본과 자동으로 짝을 지어요. 사진을 누르고 있으면 보정 전 원본이 보여요.</span><span className="mb">누르고 있으면 보정 전 원본이 보여요.</span></p>
          </div>
        </div>
      </div>
    </section>

    <section className="guest" id="guest" aria-label="하객 사진 모으기">
      <div className="wrap grid">
        <div>
          <div className="eb">결혼식을 앞두고 있다면</div>
          <h2>QR 하나 두면,<br />하객 사진이 한 앨범으로 모여요.</h2>
          <p className="lead">식장에 QR만 두면, 하객들이 가입 없이 사진과 영상을 원본 그대로 보내요. 예식이 끝나면 한 앨범에서 골라 내려받아요.</p>
          <Link className="btn o" href={guest}>하객 앨범 만들기</Link>
        </div>
        <img className="gimg" src="/landing/select/guest-album.jpg" width={1024} height={1536} loading="lazy" alt="식장 테이블의 QR 안내판 옆에서 하객이 휴대폰으로 하객 앨범에 사진 5장을 보내는 장면" />
      </div>
    </section>

    <section className="faq" aria-label="자주 묻는 질문">
      <div className="wrap grid">
        <div><h2 className="sec-h" style={{ fontSize: "clamp(24px,3vw,32px)" }}>자주 묻는 질문</h2></div>
        <div>
          <details><summary>몇 장까지 올릴 수 있나요?</summary><p>지금은 모든 프로젝트를 합쳐 3,000장까지 올릴 수 있어요.</p></details>
          <details><summary>원본 화질 그대로 저장되나요?</summary><p>A-CUT에는 고르기 위한 사진으로 저장돼요. 원본은 작가님께 받은 파일을 따로 보관해 주세요.</p></details>
          <details><summary>누가 사진을 볼 수 있나요?</summary><p>내가 링크를 보낸 가족과 작가님만 볼 수 있어요.</p></details>
          <details><summary>장면은 항상 정확하게 나뉘나요?</summary><p>AI가 촬영 시각과 사진 내용을 보고 나누기 때문에 실제와 조금 다르게 묶일 때도 있어요. 사진이 100장보다 적으면 장면 없이 한 번에 보여줘요.</p></details>
          <details><summary>하객 사진은 언제까지 보관되나요?</summary><p>결혼식 날짜로부터 {retentionDays}일 동안 보관하고, 그 뒤에는 자동으로 지워져요. 그 전에 골라서 내려받으세요.</p></details>
        </div>
      </div>
    </section>

    <section className="final" aria-label="마무리">
      <div className="wrap">
        <div className="tidy" id="tidy" aria-hidden="true" />
        <h2>받은 원본, 미루지 말고 올려 두세요.<br />고르기 쉽게 A-CUT이 정리해 드릴게요.</h2>
        <Link className="btn o" href={start}>내 사진 셀렉 시작하기</Link>
        <Link className="alt" href={guest}>결혼식을 앞두고 있다면 <b>하객 앨범 만들기 →</b></Link>
      </div>
    </section>
    <footer><Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link> · 문의 <a href="mailto:multihatter@gmail.com">multihatter@gmail.com</a><span className="biz">상호: 순한설기 · 대표: 심효순 · 사업자등록번호: 890-18-01386 · 주소: 경기도 여주시 영릉로35-12 · 전화: 031-885-4355</span></footer>
  </div>;
}
