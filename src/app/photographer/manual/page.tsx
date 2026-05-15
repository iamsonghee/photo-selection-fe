"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Camera,
  FolderPlus,
  Upload,
  Link2,
  CheckSquare,
  ImagePlus,
  RefreshCw,
  Users,
  Eye,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { PhotographerPageHeader } from "@/components/layout/PhotographerPageHeader";

// ─── 섹션 정의 ───────────────────────────────────────────────────────────────

type Section = {
  id: string;
  label: string;
  icon: React.ReactNode;
  group: "photographer" | "customer" | "common";
};

const SECTIONS: Section[] = [
  { id: "intro",       label: "A-CUT이란?",    icon: <Camera size={15} />,      group: "photographer" },
  { id: "create",      label: "프로젝트 만들기", icon: <FolderPlus size={15} />,  group: "photographer" },
  { id: "upload",      label: "사진 업로드",    icon: <Upload size={15} />,      group: "photographer" },
  { id: "invite",      label: "고객 초대",      icon: <Link2 size={15} />,       group: "photographer" },
  { id: "results",     label: "셀렉 결과 확인", icon: <CheckSquare size={15} />, group: "photographer" },
  { id: "retouch",     label: "보정본 업로드",  icon: <ImagePlus size={15} />,   group: "photographer" },
  { id: "deliver",     label: "재보정 & 납품",  icon: <RefreshCw size={15} />,   group: "photographer" },
  { id: "c-gallery",   label: "고객 갤러리",    icon: <Users size={15} />,       group: "customer" },
  { id: "c-review",    label: "보정본 검토",    icon: <Eye size={15} />,         group: "customer" },
  { id: "faq",         label: "자주 묻는 질문", icon: <HelpCircle size={15} />,  group: "common" },
];

// ─── 스크린샷 placeholder ────────────────────────────────────────────────────

function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [exists, setExists] = useState(true);

  if (!exists) {
    return (
      <div className="w-full rounded-xl border-2 border-dashed border-[#27272c] bg-[#0f0f12] flex flex-col items-center justify-center gap-3 py-14 my-6">
        <Camera size={32} className="text-zinc-600" />
        <span className="text-xs text-zinc-600">{alt}</span>
      </div>
    );
  }

  return (
    <figure className="my-6">
      <div className="rounded-xl overflow-hidden border border-[#1a1a1e] shadow-lg">
        <img
          src={src}
          alt={alt}
          className="w-full object-cover"
          onError={() => setExists(false)}
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-zinc-500 text-center">{caption}</figcaption>
      )}
    </figure>
  );
}

// ─── 스텝 블록 ───────────────────────────────────────────────────────────────

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3 my-5">
      {items.map((text, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-[#FF4D00]/15 border border-[#FF4D00]/30 text-[#FF4D00] text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
        </li>
      ))}
    </ol>
  );
}

// ─── 팁 블록 ─────────────────────────────────────────────────────────────────

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 rounded-xl bg-[#FF4D00]/8 border border-[#FF4D00]/20 my-4">
      <span className="text-[#FF4D00] text-xs font-bold uppercase tracking-wider shrink-0 mt-0.5">TIP</span>
      <p className="text-sm text-zinc-300 leading-relaxed">{children}</p>
    </div>
  );
}

// ─── 경고 블록 ───────────────────────────────────────────────────────────────

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 my-4">
      <span className="text-amber-400 text-xs font-bold shrink-0 mt-0.5">⚠</span>
      <p className="text-sm text-zinc-300 leading-relaxed">{children}</p>
    </div>
  );
}

// ─── 섹션 제목 ───────────────────────────────────────────────────────────────

function SectionHeader({
  id,
  num,
  title,
  desc,
  icon,
}: {
  id: string;
  num: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{num}</span>
        <div className="flex-1 h-px bg-[#1a1a1e]" />
      </div>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#FF4D00]/10 border border-[#FF4D00]/20 text-[#FF4D00] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-sm text-zinc-500 mt-1">{desc}</p>
        </div>
      </div>
    </div>
  );
}

// ─── 고객 섹션 그룹 배너 ─────────────────────────────────────────────────────

function CustomerGroupBanner() {
  return (
    <div className="flex items-center gap-4 my-10">
      <div className="flex-1 h-px bg-[#1a1a1e]" />
      <span className="shrink-0 px-4 py-1.5 rounded-full bg-[#1a1a1e] border border-[#27272c] text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        고객이 보는 화면
      </span>
      <div className="flex-1 h-px bg-[#1a1a1e]" />
    </div>
  );
}

// ─── 플로우차트 (섹션 0) ─────────────────────────────────────────────────────

function WorkflowChart() {
  const steps = [
    { label: "프로젝트 생성", sub: "이름·기한·셀렉 갯수" },
    { label: "사진 업로드",   sub: "원본 JPEG/PNG/HEIC" },
    { label: "고객 초대",     sub: "링크 공유 (PIN 선택)" },
    { label: "셀렉 확인",     sub: "별점·코멘트 포함" },
    { label: "V1 보정 업로드", sub: "고객에게 검토 요청" },
    { label: "납품 완료",     sub: "V2 또는 최종 확정" },
  ];

  return (
    <div className="my-6 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max mx-auto w-fit">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex flex-col items-center text-center w-24">
              <div className="w-10 h-10 rounded-full bg-[#FF4D00]/15 border border-[#FF4D00]/30 flex items-center justify-center text-[#FF4D00] text-sm font-bold">
                {i + 1}
              </div>
              <span className="text-xs font-semibold text-white mt-2 leading-tight">{s.label}</span>
              <span className="text-[10px] text-zinc-600 mt-1 leading-tight">{s.sub}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight size={16} className="text-zinc-600 shrink-0 mb-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FAQ 아이템 ───────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#1a1a1e] last:border-0">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-4 py-4 text-left hover:bg-[#1a1a1e]/30 px-2 -mx-2 rounded-lg transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-semibold text-white leading-snug">{q}</span>
        <span className={`text-zinc-500 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}>
          <ChevronRight size={16} />
        </span>
      </button>
      {open && (
        <div className="pb-4 px-2 -mx-2 text-sm text-zinc-400 leading-relaxed">{a}</div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function ManualPage() {
  const [activeId, setActiveId] = useState("intro");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const entries: Record<string, boolean> = {};

    observerRef.current = new IntersectionObserver(
      (obs) => {
        obs.forEach((entry) => {
          entries[entry.target.id] = entry.isIntersecting;
        });
        const visible = ids.find((id) => entries[id]);
        if (visible) setActiveId(visible);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cardCls = "bg-[#121215] border border-[#1a1a1e] rounded-2xl overflow-hidden";

  return (
    <div
      className="min-h-screen bg-[#0a0a0c] text-white"
      style={{ fontFamily: "var(--font-inter, 'Pretendard', sans-serif)" }}
    >
      <PhotographerPageHeader
        crumbs={[{ label: "매뉴얼" }]}
        title="사용 매뉴얼"
        stats={[{ label: "베타", value: "v1.0" }]}
      />

      <div className="flex gap-0 md:gap-8 p-4 md:p-8 max-w-[1200px] mx-auto">
        {/* ── 좌측 목차 (sticky) ── */}
        <aside className="hidden md:block shrink-0 w-52">
          <nav className="sticky top-24 space-y-0.5">
            {/* 작가 관점 */}
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest px-3 py-2 mt-1">
              작가 관점
            </p>
            {SECTIONS.filter((s) => s.group === "photographer").map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeId === s.id
                    ? "bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20"
                    : "text-zinc-400 hover:text-white hover:bg-[#1a1a1e]"
                }`}
              >
                <span className="shrink-0">{s.icon}</span>
                {s.label}
              </button>
            ))}

            <div className="h-px bg-[#1a1a1e] my-2" />

            {/* 고객 화면 */}
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest px-3 py-2">
              고객 화면
            </p>
            {SECTIONS.filter((s) => s.group === "customer").map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeId === s.id
                    ? "bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20"
                    : "text-zinc-400 hover:text-white hover:bg-[#1a1a1e]"
                }`}
              >
                <span className="shrink-0">{s.icon}</span>
                {s.label}
              </button>
            ))}

            <div className="h-px bg-[#1a1a1e] my-2" />

            {/* 공통 */}
            {SECTIONS.filter((s) => s.group === "common").map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeId === s.id
                    ? "bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20"
                    : "text-zinc-400 hover:text-white hover:bg-[#1a1a1e]"
                }`}
              >
                <span className="shrink-0">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── 본문 ── */}
        <main className="flex-1 min-w-0 space-y-12">

          {/* ── 0. A-CUT이란? ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="intro"
                num="00"
                title="A-CUT이란?"
                desc="사진작가와 고객 사이의 셀렉·보정 과정을 하나의 링크로 연결하는 서비스입니다."
                icon={<Camera size={18} />}
              />
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                A-CUT은 <strong className="text-white">프로젝트 단위</strong>로 촬영 건을 관리합니다.
                작가가 원본 사진을 업로드하면, 고객은 초대 링크 하나로 사진을 선택하고 코멘트를 남길 수 있습니다.
                보정본 업로드, 검토 요청, 재보정까지 하나의 흐름으로 이어집니다.
              </p>
              <WorkflowChart />
              <Tip>베타 기간에는 모든 기능을 무료로 이용할 수 있습니다.</Tip>
            </div>
          </section>

          {/* ── 1. 프로젝트 만들기 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="create"
                num="01"
                title="프로젝트 만들기"
                desc="촬영 건 하나 = 프로젝트 하나. 사이드바에서 '프로젝트' 메뉴로 이동하세요."
                icon={<FolderPlus size={18} />}
              />
              <Screenshot src="/manual/01-create-project.png" alt="프로젝트 만들기 화면" caption="프로젝트 생성 폼 — 대시보드 우측 상단 또는 프로젝트 메뉴에서 접근" />
              <Steps items={[
                "사이드바 → <strong>프로젝트</strong> → 우측 상단 <strong>새 프로젝트</strong> 버튼 클릭",
                "<strong>프로젝트 이름</strong>을 입력합니다. (예: 2024 스냅 홍길동)",
                "<strong>고객 이름</strong>을 입력합니다. 고객 갤러리 상단에 표시됩니다.",
                "<strong>촬영일</strong>과 <strong>셀렉 기한</strong>을 설정합니다.",
                "고객이 선택해야 하는 <strong>최소·최대 장수</strong>를 입력합니다.",
                "<strong>만들기</strong> 버튼을 눌러 프로젝트를 생성합니다.",
              ]} />
              <Tip>셀렉 갯수를 '최소 = 최대'로 설정하면 정확히 N장만 선택 가능합니다.</Tip>
            </div>
          </section>

          {/* ── 2. 사진 업로드 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="upload"
                num="02"
                title="사진 업로드"
                desc="원본 사진을 업로드합니다. JPEG, PNG, HEIC 형식을 지원합니다."
                icon={<Upload size={18} />}
              />
              <Screenshot src="/manual/02-upload.png" alt="사진 업로드 화면" caption="업로드 페이지 — 드래그 앤 드롭 또는 파일 선택으로 대량 업로드 가능" />
              <Steps items={[
                "프로젝트 상세 페이지에서 <strong>업로드</strong> 탭으로 이동합니다.",
                "사진 파일을 <strong>드래그 앤 드롭</strong>하거나, 클릭해서 파일 선택 창을 엽니다.",
                "업로드가 완료되면 썸네일 그리드에서 사진을 확인할 수 있습니다.",
                "잘못 올린 사진은 썸네일 위 <strong>X 버튼</strong>을 눌러 삭제할 수 있습니다.",
              ]} />
              <Warning>
                CR3(Canon RAW), ARW(Sony RAW) 등 RAW 파일은 지원하지 않습니다. JPG/HEIC로 변환 후 업로드하세요.
              </Warning>
              <Tip>
                대량 업로드 시 8장씩 순차 전송되므로 브라우저 탭을 닫지 마세요. 연결이 끊기면 업로드가 중단됩니다.
              </Tip>
            </div>
          </section>

          {/* ── 3. 고객 초대 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="invite"
                num="03"
                title="고객 초대"
                desc="사진 업로드가 완료되면 고객 초대 링크가 활성화됩니다."
                icon={<Link2 size={18} />}
              />
              <Screenshot src="/manual/03-invite.png" alt="고객 초대 링크 화면" caption="프로젝트 상세 → 초대 링크 복사 버튼" />
              <Steps items={[
                "사진 업로드가 1장 이상 완료되면 프로젝트 상세 페이지에 <strong>초대 링크</strong>가 표시됩니다.",
                "<strong>링크 복사</strong> 버튼을 눌러 클립보드에 복사합니다.",
                "카카오톡, 문자, 이메일 등으로 고객에게 링크를 전달합니다.",
                "PIN을 설정한 경우, 고객에게 PIN 번호도 함께 전달해야 합니다.",
              ]} />
              <Tip>PIN을 설정하면 링크를 아는 사람 모두가 아닌, PIN을 아는 사람만 접근할 수 있습니다.</Tip>
            </div>
          </section>

          {/* ── 4. 셀렉 결과 확인 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="results"
                num="04"
                title="셀렉 결과 확인"
                desc="고객이 확정한 사진 목록과 코멘트를 워크플로우 페이지에서 확인합니다."
                icon={<CheckSquare size={18} />}
              />
              <Screenshot src="/manual/04-results.png" alt="셀렉 결과 워크플로우 화면" caption="워크플로우 페이지 — 원본 탭에서 선택된 사진 확인" />
              <Steps items={[
                "프로젝트 상세 → <strong>워크플로우</strong> 탭으로 이동합니다.",
                "<strong>원본</strong> 탭에서 고객이 선택한 사진만 필터링해서 볼 수 있습니다.",
                "각 사진의 <strong>별점</strong>과 <strong>코멘트</strong>를 확인합니다.",
                "<strong>내보내기</strong> 버튼으로 선택 결과를 CSV 파일로 다운로드할 수 있습니다.",
              ]} />
              <Tip>
                CSV 파일에는 파일명, 별점, 코멘트, 선택 여부가 포함됩니다. 라이트룸 등에서 파일명 기준으로
                정렬·필터링할 때 활용하세요.
              </Tip>
            </div>
          </section>

          {/* ── 5. 보정본 업로드 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="retouch"
                num="05"
                title="보정본 업로드"
                desc="보정이 완료된 사진(V1)을 업로드하고 고객에게 검토를 요청합니다."
                icon={<ImagePlus size={18} />}
              />
              <Screenshot src="/manual/05-retouch.png" alt="보정본 업로드 화면" caption="워크플로우 페이지 — V1 탭에서 보정본 업로드" />
              <Steps items={[
                "워크플로우 → <strong>V1</strong> 탭으로 이동합니다.",
                "보정 완료된 사진을 업로드합니다. 원본과 동일한 파일명을 사용하는 것을 권장합니다.",
                "업로드 완료 후 <strong>고객에게 검토 요청</strong> 버튼을 클릭합니다.",
                "고객은 초대 링크로 접속하면 보정본 검토 페이지가 자동으로 표시됩니다.",
              ]} />
              <Warning>
                원본 파일명과 다른 이름으로 업로드해도 무방하지만, 동일하게 유지하면 나중에 찾기 편합니다.
              </Warning>
            </div>
          </section>

          {/* ── 6. 재보정 & 납품 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="deliver"
                num="06"
                title="재보정 & 납품"
                desc="고객 피드백에 따라 V2를 업로드하거나, 최종 납품 상태로 전환합니다."
                icon={<RefreshCw size={18} />}
              />
              <Screenshot src="/manual/06-deliver.png" alt="재보정 납품 화면" caption="V2 탭 — 재보정 요청이 있을 때 활성화됨" />
              <Steps items={[
                "고객이 보정본을 <strong>확정</strong>하면 프로젝트가 납품 완료 상태로 전환됩니다.",
                "고객이 <strong>재보정 요청</strong>을 남기면 워크플로우 → <strong>V2</strong> 탭이 활성화됩니다.",
                "V2 탭에서 재보정된 사진을 업로드한 뒤 다시 <strong>검토 요청</strong>을 보냅니다.",
                "고객이 최종 확정하면 프로젝트 상태가 <strong>완료</strong>로 바뀝니다.",
              ]} />
              <Tip>
                보정본은 최대 2회(V1 → V2)까지 업로드할 수 있습니다. V2에서 최종 확정되면 프로젝트가 완료됩니다.
              </Tip>
            </div>
          </section>

          {/* ── 고객 화면 구분 배너 ── */}
          <CustomerGroupBanner />

          {/* ── 7. 고객 갤러리 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="c-gallery"
                num="07"
                title="고객 갤러리"
                desc="고객이 초대 링크로 접속해 사진을 선택하는 화면입니다."
                icon={<Users size={18} />}
              />
              <Screenshot src="/manual/07-customer-gallery.png" alt="고객 갤러리 화면" caption="고객 갤러리 — 초대 링크 접속 후 표시되는 화면" />
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                고객은 초대 링크 하나로 별도 회원가입 없이 갤러리에 접속합니다. Google 계정으로 간단히
                로그인한 후, 작가가 설정한 장수 범위 안에서 원하는 사진을 선택할 수 있습니다.
              </p>
              <Steps items={[
                "초대 링크를 브라우저에서 엽니다. (카카오 인앱 → 외부 브라우저에서 열기 권장)",
                "PIN이 설정된 경우 PIN을 입력합니다.",
                "<strong>Google 계정</strong>으로 로그인합니다.",
                "사진을 클릭해서 선택합니다. 선택된 사진에는 체크 표시가 나타납니다.",
                "별점(1~5)과 코멘트를 남길 수 있습니다. (선택 사항)",
                "장수 조건을 충족하면 하단 <strong>최종 확정</strong> 버튼이 활성화됩니다.",
                "<strong>최종 확정</strong>을 누르면 작가에게 셀렉 결과가 전달됩니다.",
              ]} />
              <Warning>
                최종 확정 후에는 선택을 변경할 수 없습니다. 고객에게 미리 안내해 주세요.
              </Warning>
            </div>
          </section>

          {/* ── 8. 보정본 검토 ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="c-review"
                num="08"
                title="보정본 검토"
                desc="작가가 보정본을 업로드하면 고객은 동일한 링크로 보정본을 확인합니다."
                icon={<Eye size={18} />}
              />
              <Screenshot src="/manual/08-customer-review.png" alt="고객 보정본 검토 화면" caption="보정본 검토 화면 — 확정 또는 재보정 요청 선택" />
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                작가가 검토 요청을 보내면 고객은 초대 링크로 접속했을 때 자동으로 보정본 검토 페이지를
                볼 수 있습니다. 고객은 각 사진을 확인한 후 전체를 확정하거나, 특정 사진에 재보정을
                요청할 수 있습니다.
              </p>
              <Steps items={[
                "초대 링크로 접속하면 보정본 검토 화면이 표시됩니다.",
                "사진을 클릭해서 크게 볼 수 있습니다.",
                "이상이 없으면 <strong>전체 확정</strong> 버튼을 누릅니다.",
                "재보정이 필요한 경우 해당 사진에 코멘트를 남기고 <strong>재보정 요청</strong>을 선택합니다.",
              ]} />
            </div>
          </section>

          {/* ── 9. FAQ ── */}
          <section className={cardCls}>
            <div className="p-6 md:p-8">
              <SectionHeader
                id="faq"
                num="09"
                title="자주 묻는 질문"
                desc="자주 발생하는 문제와 해결 방법을 정리했습니다."
                icon={<HelpCircle size={18} />}
              />
              <div className="mt-4">
                <FaqItem
                  q="어떤 파일 형식을 업로드할 수 있나요?"
                  a="JPEG, JPG, PNG, HEIC 형식을 지원합니다. CR3, ARW 등 RAW 파일은 지원하지 않으니 JPG나 HEIC로 변환 후 업로드해 주세요."
                />
                <FaqItem
                  q="업로드 도중 실패한 사진이 있어요."
                  a={
                    <>
                      <p>다음을 확인해 주세요:</p>
                      <ul className="list-disc pl-4 mt-2 space-y-1">
                        <li>파일 확장자가 지원 형식(JPEG/PNG/HEIC)인지 확인</li>
                        <li>파일명에 특수문자( / * ? : " 등)가 포함되어 있으면 제거 후 재시도</li>
                        <li>네트워크 연결이 안정적인지 확인</li>
                        <li>브라우저 탭을 닫지 않고 업로드가 완전히 끝날 때까지 기다리기</li>
                      </ul>
                    </>
                  }
                />
                <FaqItem
                  q="고객이 링크에 접속했는데 오류가 난다고 해요."
                  a="초대 링크는 프로젝트 상태가 '셀렉 중'일 때만 유효합니다. 사진이 1장 이상 업로드된 상태인지 확인하고, 링크를 다시 복사해 전달해 주세요."
                />
                <FaqItem
                  q="카카오톡에서 링크를 열면 로그인이 안 돼요."
                  a={
                    <>
                      카카오 인앱 브라우저는 Google 정책상 Google 로그인을 차단합니다.
                      고객에게 다음 중 하나로 안내해 주세요:
                      <ul className="list-disc pl-4 mt-2 space-y-1">
                        <li>카카오 채팅창 하단 점 세 개(···) 메뉴 → <strong>기본 브라우저로 열기</strong></li>
                        <li>링크를 길게 눌러 복사한 뒤 Safari/Chrome에서 직접 붙여넣기</li>
                      </ul>
                    </>
                  }
                />
                <FaqItem
                  q="고객이 최종 확정 후 선택을 바꾸고 싶다고 해요."
                  a="현재 베타 버전에서는 최종 확정 후 선택 변경 기능이 없습니다. 불가피한 경우 작가에게 직접 요청해 주세요."
                />
                <FaqItem
                  q="보정본 업로드 후 고객에게 알림이 자동으로 가나요?"
                  a="현재 베타 버전에서는 자동 알림 기능이 준비 중입니다. '검토 요청' 버튼 클릭 후 고객에게 직접 카카오톡/문자로 알려주시기 바랍니다."
                />
              </div>
            </div>
          </section>

          <div className="h-16" />
        </main>
      </div>
    </div>
  );
}
