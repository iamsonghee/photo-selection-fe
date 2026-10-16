"use client";

/* eslint-disable @next/next/no-img-element -- 시안 그대로의 정적 샘플 사진 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { landingFontVars } from "@/lib/landing-fonts";
import { startMainLanding } from "./motion";
import "./main-landing.css";

const PIC = (n: string) => `/landing/main/${n}.jpg`;
const Logo = ({ k }: { k?: number }) => <span className="blogo" style={k ? ({ "--k": k } as React.CSSProperties) : undefined} role="img" aria-label="A-CUT"><i>A</i><b>A-CUT<span>.</span></b></span>;
const ICON = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** 화면 구조와 문구는 design/landing-preview/main 시안을 그대로 옮겼다. 움직임은 ./motion.ts. */
export function MainLanding({ loggedIn }: { loggedIn: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => startMainLanding(root.current!), []);
  const spaces = <div className="ctas"><Link className="btn n" href="/studio">작가·스튜디오 →</Link><Link className="btn n" href="/select">내 사진 셀렉 →</Link></div>;

  // data-acut-light-canvas: html·body도 밝은 캔버스로(globals.css) — 전역 바탕이 다크라 러버밴드·로딩 순간에 검게 비침
  return <div ref={root} data-acut-light-canvas className={`mnl ${landingFontVars}`}>
    <nav className="nav" aria-label="서비스 메뉴"><div className="in"><Link href="/" aria-label="A-CUT 홈"><Logo k={.82} /></Link><Link className="hide-m" href="/studio">작가·스튜디오</Link><Link className="hide-m" href="/select">내 사진 셀렉</Link><Link href={loggedIn ? "/workspaces" : "/login"}>{loggedIn ? "내 작업" : "로그인"}</Link></div></nav>

    <section className="hero" id="top" aria-label="히어로: 함께 찜하고 골라, 한곳에 모이는 장면">
      <div className="sheet" id="sheet" aria-hidden="true" />
      <div className="veil" />
      <div className="copy">
        <Logo />
        <h1 id="h1">셀렉이 <em>쉬워지면,</em><br />고객도 작가도 편해요.</h1>
        <p className="sub">고르는 일도, 받아 보는 일도 A-CUT 한곳에서.</p>
        {spaces}
      </div>
      <div className="tray" id="tray" aria-live="polite"><i className="tmark" aria-hidden="true">A</i><div className="slots" id="slots" /><div className="t"><b id="trayN">최종 선택 0장</b><small>작가님께 보냈어요</small></div><span className="av" aria-hidden="true"><i style={{ background: "#3b82f6", color: "#1a1a1a" }}>민</i><i style={{ background: "#8b5cf6", color: "#1a1a1a" }}>지</i><i style={{ background: "#22c55e", color: "#1a1a1a" }}>엄</i></span></div>
    </section>

    <section className="ways" id="ways" aria-label="두 공간">
      <div className="wrap">
        <div className="head"><h2 className="sec-h">작가님인가요, <span style={{ whiteSpace: "nowrap" }}>사진의 주인공인가요?</span></h2></div>
        <div className="doors">
          <Link className="door" href="/studio"><img src={PIC("photographer")} width={1080} height={1619} style={{ objectPosition: "50% 88%" }} alt="작가가 카메라 화면으로 신랑신부를 확인하며 촬영하는 모습" /><div className="tx"><div className="who"><svg {...ICON}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>작가·스튜디오</div><h3>찍은 사진을 보내고,<br />고객의 셀렉을 받아요.</h3><p className="pts">셀렉 링크 · 촬영별 진행 상태 · 보정본 검토</p><span className="go">자세히 보기 →</span></div></Link>
          <Link className="door" href="/select"><img src={PIC("cer08")} width={478} height={640} style={{ objectPosition: "50% 30%" }} alt="샹들리에 아래 꽃잎이 날리는 본식장에서 행진하는 신랑신부" /><div className="tx"><div className="who"><svg {...ICON}><path d="M18 22H4a2 2 0 0 1-2-2V6" /><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" /><circle cx="12" cy="8" r="2" /><rect width="16" height="16" x="6" y="2" rx="2" /></svg>내 사진 셀렉</div><h3>작가님께 받은 사진,<br />직접 골라서 보내요.</h3><p className="pts">장면별 정리 · 가족과 함께 찜 · 작가님께 링크로</p><span className="go">자세히 보기 →</span></div></Link>
        </div>
        <Link className="guest" href="/select#guest"><span className="gph"><img src={PIC("guest-album")} width={800} height={600} loading="lazy" alt="식장 테이블의 QR 안내판 옆에서 하객이 휴대폰으로 사진을 보내는 장면" /></span><span className="gtx"><small>결혼식을 앞두고 있다면</small><b>QR 하나로, <span className="nw">하객 사진을 한 앨범에 모아요.</span></b><span><span className="dk">QR만 찍으면 하객이 원본 그대로 보내요. 마음에 드는 사진만 골라 내려받으세요.</span><span className="mb">가입 없이 보내고, 골라서 내려받아요.</span></span></span><span className="garr" aria-hidden="true">→</span></Link>
      </div>
    </section>

    <section className="final" aria-label="마무리와 자주 묻는 질문">
      <div className="wrap">
        <div className="still" id="still" aria-hidden="true" />
        <h2>다음 셀렉은,<br /><em>쉽고 편하게.</em></h2>
        <p className="free">지금은 무료로 써볼 수 있어요. <br className="mbr" />Google·카카오로 바로 시작해요.</p>
        {spaces}
        <div className="faq">
          <details><summary>작가·스튜디오와 내 사진 셀렉, 계정이 따로인가요?</summary><p>아니요. 같은 계정으로 두 공간을 모두 쓰고, 작업 중에도 메뉴에서 바로 오가요.</p></details>
          <details><summary>사진은 누가 볼 수 있나요?</summary><p>링크를 받은 사람만 볼 수 있어요. 작가·스튜디오 프로젝트는 4자리 PIN을 걸 수 있어요.</p></details>
          <details><summary>어떤 파일을 올릴 수 있나요?</summary><p>JPG, PNG, WebP, HEIC를 올릴 수 있어요. RAW는 아직 지원하지 않아요.</p></details>
        </div>
      </div>
    </section>
    <footer><Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link> · 문의 <a href="mailto:multihatter@gmail.com">multihatter@gmail.com</a><span style={{ display: "block", marginTop: 6, fontSize: 12 }}>상호: 순한설기 · 대표: 심효순 · 사업자등록번호: 890-18-01386 · 주소: 경기도 여주시 영릉로35-12 · 전화: 031-885-4355</span></footer>
  </div>;
}
