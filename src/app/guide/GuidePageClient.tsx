"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const ORANGE = "var(--accent)";
const BG = "var(--background)";
const SURFACE = "var(--surface)";
const BORDER = "var(--border-subtle)";
const MUTED = "var(--subtle-foreground)";

type Tab = "photographer" | "client";

// ── Shared sub-components ─────────────────────────────────────────────────────

function ScreenshotPlaceholder() {
  return (
    <div
      style={{
        border: `1.5px dashed ${BORDER}`,
        borderRadius: 4,
        height: 220,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: MUTED,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.1em",
        marginBottom: 32,
        background: SURFACE,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      SCREENSHOT_PENDING
    </div>
  );
}

function SectionBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 4,
        background: ORANGE,
        color: "#000",
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontSize: 14,
        flexShrink: 0,
        marginRight: 12,
      }}
    >
      {n}
    </span>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${ORANGE}`,
        paddingLeft: 16,
        paddingTop: 12,
        paddingBottom: 12,
        paddingRight: 16,
        background: "var(--surface-raised)",
        borderRadius: "0 4px 4px 0",
        marginTop: 24,
        fontSize: 14,
        lineHeight: 1.7,
        color: "var(--muted-foreground)",
      }}
    >
      <span
        style={{
          display: "block",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: ORANGE,
          marginBottom: 8,
        }}
      >
        TIP
      </span>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 16, marginBottom: 20 }}>
      <span
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: `1.5px solid ${ORANGE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: ORANGE,
          marginTop: 2,
        }}
      >
        {n}
      </span>
      <div style={{ flex: 1 }}>
        <strong style={{ color: "var(--foreground)", display: "block", marginBottom: 4 }}>{title}</strong>
        <div style={{ color: "var(--muted-foreground)", fontSize: 14, lineHeight: 1.7 }}>{children}</div>
      </div>
    </li>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${BORDER}`, marginBottom: 80 }} />;
}

// ── Tab content ───────────────────────────────────────────────────────────────

function PhotographerContent() {
  return (
    <>
      {/* Index */}
      <nav style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "20px 24px", marginBottom: 64 }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: MUTED, marginBottom: 14 }}>
          INDEX
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["#section-1", "01", "첫 프로젝트 만들기"],
            ["#section-2", "02", "사진 업로드하기"],
            ["#section-3", "03", "고객 초대 링크 생성 및 공유"],
            ["#section-4", "04", "고객 셀렉 결과 확인하기"],
            ["#faq", "—", "자주 묻는 질문"],
          ].map(([href, badge, label]) => (
            <li key={href} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: badge === "—" ? MUTED : ORANGE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, width: 20 }}>{badge}</span>
              <a href={href} style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 14 }}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Section 1 */}
      <section id="section-1" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={1} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>
            첫 프로젝트 만들기
          </h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>
          촬영 건별로 프로젝트를 생성해 고객 셀렉 작업을 관리합니다.
        </p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="로그인">
            <a href="https://acut.vercel.app" target="_blank" rel="noreferrer" style={{ color: ORANGE }}>acut.vercel.app</a>에 접속한 뒤 <strong style={{ color: "var(--foreground)" }}>"Google로 시작하기"</strong> 버튼을 클릭합니다.
            <br /><span style={{ fontSize: 12, color: MUTED }}>※ 베타 기간 중 구글 로그인만 지원합니다. 카카오 로그인은 정식 출시 후 제공 예정.</span>
          </Step>
          <Step n={2} title="대시보드 진입">로그인하면 대시보드로 자동 이동합니다.</Step>
          <Step n={3} title="새 프로젝트 생성">화면 오른쪽 하단의 <strong style={{ color: "var(--foreground)" }}>"새 프로젝트" (+) 버튼</strong>을 클릭합니다.</Step>
          <Step n={4} title="프로젝트 정보 입력">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr>
                    {["항목", "필수", "설명"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, color: MUTED, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["프로젝트명", "필수", "내부 관리용 이름 (고객에게도 표시됨)"],
                    ["촬영 유형", "필수", "웨딩 / 가족·베이비 / 졸업·기념 / 프로필·증명 / 기타"],
                    ["촬영 일자", "필수", "실제 촬영한 날짜"],
                    ["고객 이름", "필수", "고객 갤러리 화면에 표시됨"],
                    ["고객 연락처", "선택", "내부 메모용"],
                    ["셀렉 갯수 N", "필수", "고객이 최종 선택해야 할 사진 수"],
                    ["셀렉 기한", "필수", "3 / 5 / 7 / 14 / 30일 중 선택"],
                    ["위치", "선택", "촬영 장소"],
                    ["고객 비밀번호 (PIN)", "선택", "설정 시 링크 받은 사람도 PIN 입력 필요"],
                    ["재보정 횟수", "선택", "0 / 1 / 2회 — 보정본 피드백 라운드 수"],
                  ].map(([item, req, desc]) => (
                    <tr key={item}>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, color: "var(--foreground)", fontWeight: 500 }}>{item}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, color: req === "필수" ? ORANGE : MUTED, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{req}</td>
                      <td style={{ padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, color: "var(--muted-foreground)" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <br />입력 완료 후 <strong style={{ color: "var(--foreground)" }}>"만들기" 버튼</strong>을 클릭합니다.
          </Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>셀렉 기한은 프로젝트 생성 후에도 수정할 수 있어요.</li>
            <li>PIN을 설정했다면 링크와 비밀번호를 <strong style={{ color: "var(--foreground)" }}>함께</strong> 고객에게 전달해야 합니다.</li>
            <li>베타 기간 중 프로젝트는 최대 <strong style={{ color: "var(--foreground)" }}>10개</strong>까지 생성 가능합니다.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Section 2 */}
      <section id="section-2" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={2} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>사진 업로드하기</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>촬영한 원본 사진을 업로드해 고객이 선택할 수 있는 갤러리를 만듭니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="프로젝트 진입">대시보드에서 해당 프로젝트 카드를 클릭합니다.</Step>
          <Step n={2} title="업로드 시작">프로젝트 상세 페이지 상단의 <strong style={{ color: "var(--foreground)" }}>"원본 업로드" 버튼</strong>을 클릭합니다.</Step>
          <Step n={3} title="파일 선택">
            업로드할 사진 파일을 선택합니다. 단일 또는 다중 선택 모두 가능합니다.<br />
            지원 형식: <strong style={{ color: "var(--foreground)" }}>JPEG, PNG, WebP, HEIC/HEIF</strong>
          </Step>
          <Step n={4} title="업로드 진행 확인">업로드 진행률이 화면에 표시됩니다. 프로젝트 상태가 "업로드 중"으로 표시됩니다.</Step>
          <Step n={5} title="완료 확인">셀렉 갯수(N장) 이상 업로드가 완료되면 화면 하단의 <strong style={{ color: "var(--foreground)" }}>"고객 초대 링크 활성화" 버튼</strong>이 활성화됩니다.</Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>RAW 파일(CR3, NEF 등)은 지원하지 않습니다. <strong style={{ color: "var(--foreground)" }}>JPEG 또는 HEIC로 변환</strong> 후 업로드해 주세요.</li>
            <li>한 프로젝트에 최대 <strong style={{ color: "var(--foreground)" }}>1,500장</strong>까지 업로드 가능합니다 (베타 제한).</li>
            <li>업로드 도중에도 갤러리에서 실시간으로 진행 상황을 확인할 수 있어요.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Section 3 */}
      <section id="section-3" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={3} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>고객 초대 링크 생성 및 공유</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>고객이 사진을 선택할 수 있도록 전용 갤러리 링크를 활성화하고 공유합니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="초대 링크 활성화">
            업로드 페이지 하단의 <strong style={{ color: "var(--foreground)" }}>"고객 초대 링크 활성화" 버튼</strong>을 클릭합니다.<br />
            <span style={{ fontSize: 12, color: MUTED }}>이 버튼은 셀렉 갯수(N장) 이상 업로드됐을 때만 클릭할 수 있어요.</span>
          </Step>
          <Step n={2} title="공유 모달 확인">버튼 클릭 즉시 프로젝트 상태가 <strong style={{ color: "var(--foreground)" }}>"셀렉 중"</strong>으로 변경되고, 공유 모달이 자동으로 열립니다.</Step>
          <Step n={3} title="링크 복사">
            PIN을 설정한 경우 <strong style={{ color: "var(--foreground)" }}>"링크와 비밀번호 복사"</strong> 버튼을 클릭합니다.<br />
            PIN이 없는 경우 <strong style={{ color: "var(--foreground)" }}>"초대 링크 공유"</strong> 버튼을 클릭합니다.
          </Step>
          <Step n={4} title="고객에게 전달">
            복사된 링크를 카카오톡, 문자 등으로 고객에게 <strong style={{ color: "var(--foreground)" }}>직접 전달</strong>합니다.<br />
            <span style={{ fontSize: 12, color: MUTED }}>※ 앱 내 자동 전송 기능은 베타 기간 중 제공하지 않습니다.</span>
          </Step>
          <Step n={5} title="고객 셀렉 시작">고객이 링크 접속 → 사진 선택 시작.</Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>"링크와 비밀번호 복사" 버튼으로 링크와 PIN을 <strong style={{ color: "var(--foreground)" }}>한 번에</strong> 복사할 수 있어요.</li>
            <li>나중에 링크를 다시 공유해야 할 때는 프로젝트 페이지에서 언제든 다시 복사 가능합니다.</li>
            <li>고객은 갤러리에서 사진마다 별점(1~5점)과 색상 태그를 달 수 있어요. 보정 참고 자료로 활용하세요.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Section 4 */}
      <section id="section-4" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={4} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>고객 셀렉 결과 확인하기</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>고객이 최종 확정한 사진 목록을 확인하고 보정을 시작합니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="셀렉 완료 확인">대시보드에서 해당 프로젝트 상태 배지가 <strong style={{ color: "var(--foreground)" }}>"셀렉 완료"</strong>로 변경됐는지 확인합니다.</Step>
          <Step n={2} title="결과 페이지 진입">프로젝트 카드를 클릭한 뒤, 워크플로우에서 <strong style={{ color: "var(--foreground)" }}>"셀렉 확인"</strong> 단계를 클릭합니다.</Step>
          <Step n={3} title="선택 결과 확인">고객이 선택한 사진 목록과 각 사진에 남긴 코멘트를 확인합니다.</Step>
          <Step n={4} title="목록 내보내기 (선택)">
            <strong style={{ color: "var(--foreground)" }}>"CSV"</strong> 버튼으로 파일명 목록을 다운로드하거나, <strong style={{ color: "var(--foreground)" }}>"CLIPBOARD"</strong> 버튼으로 복사할 수 있어요.
          </Step>
          <Step n={5} title="보정 시작">결과를 확인했으면 <strong style={{ color: "var(--foreground)" }}>"보정 시작하기" 버튼</strong>을 클릭합니다. 프로젝트 상태가 "보정 중"으로 전환됩니다.</Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>"보정 시작하기"를 클릭하면 고객은 더 이상 최종확정을 취소할 수 없어요. 클릭 전에 선택 목록을 꼭 확인해 주세요.</li>
            <li>고객이 코멘트를 남겼다면 결과 페이지에서 먼저 읽고 보정을 시작하세요.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Photographer FAQ */}
      <FaqSection items={PHOTOGRAPHER_FAQ} />
    </>
  );
}

function ClientContent() {
  return (
    <>
      {/* Index */}
      <nav style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: "20px 24px", marginBottom: 64 }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: MUTED, marginBottom: 14 }}>
          INDEX
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["#section-5", "01", "링크 접속하기"],
            ["#section-6", "02", "사진 선택 및 최종 확정"],
            ["#section-7", "03", "보정본 검토하기"],
            ["#faq", "—", "자주 묻는 질문"],
          ].map(([href, badge, label]) => (
            <li key={href} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: badge === "—" ? MUTED : ORANGE, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, width: 20 }}>{badge}</span>
              <a href={href} style={{ color: "var(--muted-foreground)", textDecoration: "none", fontSize: 14 }}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Section 5 */}
      <section id="section-5" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={1} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>링크 접속하기</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>작가에게 받은 링크로 갤러리에 접속합니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="링크 열기">작가에게 받은 링크를 브라우저에서 엽니다.</Step>
          <Step n={2} title="비밀번호 입력 (설정된 경우)">작가가 PIN을 설정했다면 4자리 비밀번호 입력 화면이 나타납니다. 작가에게 받은 비밀번호를 입력합니다.</Step>
          <Step n={3} title="갤러리 진입">작가 정보, 선택 갯수, 셀렉 기한을 확인한 뒤 <strong style={{ color: "var(--foreground)" }}>"사진 보러 가기"</strong> 버튼을 클릭합니다.</Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>별도 회원가입 없이 링크만으로 접속 가능합니다.</li>
            <li>셀렉 기한은 참고용 표시이며, 기한이 지나도 링크는 계속 접속할 수 있어요.</li>
            <li>카카오톡 내에서 링크를 열었다면 Safari/Chrome으로 열기를 권장합니다.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Section 6 */}
      <section id="section-6" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={2} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>사진 선택 및 최종 확정</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>갤러리에서 원하는 사진을 선택하고 작가에게 전달합니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="사진 선택">갤러리에서 원하는 사진을 클릭해 선택합니다. 다시 클릭하면 해제됩니다.</Step>
          <Step n={2} title="별점·태그·코멘트 추가 (선택 사항)">사진을 클릭하면 상세 보기에서 별점(1~5), 색상 태그, 텍스트 코멘트를 남길 수 있어요. 작가의 보정 참고 자료가 됩니다.</Step>
          <Step n={3} title="선택 확인">상단 <strong style={{ color: "var(--foreground)" }}>"선택됨"</strong> 탭을 누르면 선택한 사진만 필터해서 확인할 수 있어요.</Step>
          <Step n={4} title="보정 의뢰">
            N장 선택이 완료되면 하단 <strong style={{ color: "var(--foreground)" }}>"보정 의뢰하기"</strong> 버튼이 활성화됩니다. 클릭 후 모달에서 <strong style={{ color: "var(--foreground)" }}>"확정 및 전송"</strong>을 눌러 최종 확정합니다.
          </Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>확정 후 작가가 보정을 시작하기 전이라면 확정 화면의 <strong style={{ color: "var(--foreground)" }}>"확정 취소 후 다시 선택"</strong> 버튼으로 최대 3회까지 되돌릴 수 있어요.</li>
            <li>별점·색상 태그·코멘트는 모두 선택 사항입니다.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Section 7 */}
      <section id="section-7" style={{ marginBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SectionBadge n={3} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>보정본 검토하기</h2>
        </div>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 28, marginLeft: 40 }}>작가가 보정본을 업로드하면 링크로 재접속해 검토합니다.</p>
        <ScreenshotPlaceholder />
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Step n={1} title="재접속">작가에게서 보정 완료 알림을 받으면 기존 링크로 다시 접속합니다.</Step>
          <Step n={2} title="보정본 확인">각 사진의 보정본을 확인하며 <strong style={{ color: "var(--foreground)" }}>확정</strong> 또는 <strong style={{ color: "var(--foreground)" }}>재보정 요청</strong> 중 하나를 선택합니다.</Step>
          <Step n={3} title="코멘트 추가 (재보정 요청 시)">재보정을 요청할 경우 코멘트로 수정 내용을 남길 수 있어요.</Step>
          <Step n={4} title="검토 완료 전달">모든 사진 검토 후 <strong style={{ color: "var(--foreground)" }}>"작가에게 전달"</strong> 버튼을 클릭합니다.</Step>
        </ol>
        <TipBox>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>재보정 횟수가 0회로 설정된 프로젝트는 이 단계가 없습니다. 보정본 전체를 확인 후 <strong style={{ color: "var(--foreground)" }}>"수령 완료"</strong> 버튼을 클릭하세요.</li>
            <li>이 섹션은 작가가 재보정 횟수를 1회 이상으로 설정한 프로젝트에만 해당합니다.</li>
          </ul>
        </TipBox>
      </section>

      <Divider />

      {/* Client FAQ */}
      <FaqSection items={CLIENT_FAQ} />
    </>
  );
}

// ── FAQ data ──────────────────────────────────────────────────────────────────

const PHOTOGRAPHER_FAQ = [
  {
    q: "고객이 링크를 받았는데 사진이 안 보인다고 해요.",
    a: "업로드가 완전히 완료됐는지 확인해 주세요. 업로드 중 상태에서는 갤러리에 사진이 보이지 않을 수 있습니다. 완료 후 링크를 다시 전달해 주세요.",
  },
  {
    q: "셀렉 기한 내에 고객이 완료하지 못했어요.",
    a: "셀렉 기한은 참고용 표시이며 기한이 지나도 링크는 계속 접속 가능합니다. 프로젝트 수정 화면에서 기한을 연장한 뒤, 고객에게 따로 알려주세요.",
  },
  {
    q: "카카오톡으로 공유받은 링크에서 구글 로그인이 안 돼요. (작가 본인 로그인 시)",
    a: `카카오톡 내 브라우저에서는 구글 로그인이 제한됩니다.\n• iOS: 우측 하단 ··· 버튼 → "Safari로 열기"\n• Android: 우측 상단 ··· 버튼 → "다른 앱으로 열기" → Chrome\n\n※ 카카오 계정 로그인은 정식 출시 후 제공 예정입니다.`,
  },
  {
    q: "프로젝트를 몇 개까지 만들 수 있나요?",
    a: "베타 기간 중에는 최대 10개까지 가능합니다. 한도에 가까워지면 대시보드 우측 사용량 패널에 알림이 표시됩니다.",
  },
  {
    q: "어떤 사진 파일 형식을 올릴 수 있나요?",
    a: "JPEG, PNG, WebP, HEIC/HEIF를 지원합니다. RAW 파일(CR3, NEF 등)은 지원하지 않으니, JPEG 또는 HEIC로 변환 후 업로드해 주세요.",
  },
];

const CLIENT_FAQ = [
  {
    q: "실수로 확정을 눌렀어요.",
    a: "작가가 보정을 시작하기 전이라면 확정 화면의 \"확정 취소 후 다시 선택\" 버튼으로 최대 3회까지 취소할 수 있습니다. 3회를 초과했거나 보정이 이미 시작됐다면 작가에게 직접 연락해 주세요.",
  },
  {
    q: "별점이나 색상 태그를 꼭 달아야 하나요?",
    a: "모두 선택 사항입니다. 남기면 작가의 보정 참고 자료가 됩니다.",
  },
  {
    q: "카카오톡으로 받은 링크가 안 열려요.",
    a: "카카오톡 내 브라우저에서 일부 기능이 제한될 수 있습니다.\n• iOS: 우측 하단 ··· 버튼 → \"Safari로 열기\"\n• Android: 우측 상단 ··· 버튼 → \"다른 앱으로 열기\" → Chrome",
  },
  {
    q: "링크를 잃어버렸어요.",
    a: "작가에게 연락해 링크를 다시 받아야 합니다. 링크는 변경되지 않으므로 기존 링크를 그대로 다시 보내드릴 수 있어요.",
  },
];

function FaqSection({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section id="faq" style={{ marginBottom: 100 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: ORANGE, marginRight: 12 }}>FAQ</span>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>자주 묻는 질문</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ q, a }) => (
          <details key={q} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4, overflow: "hidden" }}>
            <summary
              style={{
                padding: "16px 20px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 15,
                listStyle: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                userSelect: "none",
              }}
            >
              {q}
              <span style={{ color: ORANGE, fontSize: 18, marginLeft: 12, flexShrink: 0 }}>+</span>
            </summary>
            <div
              style={{
                padding: "14px 20px 18px",
                color: "var(--muted-foreground)",
                fontSize: 14,
                lineHeight: 1.8,
                borderTop: `1px solid ${BORDER}`,
                whiteSpace: "pre-line",
              }}
            >
              {a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GuidePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab: Tab = searchParams.get("tab") === "client" ? "client" : "photographer";

  function switchTab(tab: Tab) {
    router.replace(`/guide?tab=${tab}`, { scroll: false });
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: "var(--foreground)" }}>
      {/* Corner brackets */}
      <div style={{ position: "fixed", top: 16, left: 16, width: 16, height: 16, borderTop: `2px solid ${ORANGE}`, borderLeft: `2px solid ${ORANGE}`, zIndex: 50, pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: 16, right: 16, width: 16, height: 16, borderTop: `2px solid ${ORANGE}`, borderRight: `2px solid ${ORANGE}`, zIndex: 50, pointerEvents: "none" }} />

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 40, padding: "0 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: MUTED, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            A-CUT
          </Link>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: MUTED, textTransform: "uppercase" }}>
            BETA_GUIDE
          </span>
          <Link href="/" style={{ fontSize: 12, fontWeight: 600, color: ORANGE, textDecoration: "none", border: `1px solid ${ORANGE}`, padding: "5px 12px", letterSpacing: "0.04em" }}>
            시작하기 →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div style={{ padding: "64px 24px 0", maxWidth: 760, margin: "0 auto" }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: ORANGE, marginBottom: 16 }}>
          BETA — USAGE_GUIDE
        </p>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
          A컷 사용 가이드
        </h1>
        <p style={{ color: "var(--muted-foreground)", fontSize: 16, lineHeight: 1.6, marginBottom: 40 }}>
          서비스 전체 흐름을 순서대로 안내합니다.
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 48,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {(["photographer", "client"] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === "photographer" ? "작가 가이드" : "고객 가이드";
            const sub = tab === "photographer" ? "프로젝트 생성 · 업로드 · 셀렉 확인" : "링크 접속 · 사진 선택 · 보정본 검토";
            return (
              <button
                key={tab}
                type="button"
                onClick={() => switchTab(tab)}
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${ORANGE}` : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s",
                }}
              >
                <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: isActive ? "var(--foreground)" : MUTED, marginBottom: 3 }}>
                  {label}
                </span>
                <span style={{ display: "block", fontSize: 11, color: isActive ? "var(--subtle-foreground)" : "var(--disabled-foreground)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  {sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
        {activeTab === "photographer" ? <PhotographerContent /> : <ClientContent />}

        {/* Bottom CTA */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 64, paddingBottom: 100, textAlign: "center" }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: MUTED, marginBottom: 20 }}>
            READY_TO_START
          </p>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            이제 직접 써보세요.
          </h3>
          <p style={{ color: "var(--muted-foreground)", fontSize: 15, marginBottom: 32 }}>베타 기간 동안 무료로 사용할 수 있습니다.</p>
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, background: ORANGE, color: "#000", fontWeight: 700, fontSize: 16, padding: "14px 32px", textDecoration: "none", letterSpacing: "0.04em" }}
          >
            무료로 시작하기
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </main>
    </div>
  );
}
