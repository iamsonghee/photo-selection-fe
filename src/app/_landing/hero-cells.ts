// 서버 첫 화면과 클라이언트 애니메이션이 같은 사진판을 사용한다.
const POOL = ["k01", "k06", "k02", "k07", "k08", "k09", "k03", "k11", "k14", "k16", "k17", "k04", "k18", "k19", "k20", "k05", "k22", "k23", "k24", "k25", "k10", "k26", "k27", "k28", "k12", "k29", "k30", "k13", "k15", "k21"]; // 주황 니트 커플 30장 — 서 있는 컷 사이에 앉은·누운 컷을 섞음
export const PH = (i: number) => `/landing/main/${POOL[i % POOL.length]}.jpg`;
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>';
export const cellHTML = (src: string, priority = false) => `<div class="m"><img src="${src}" alt="" draggable="false" decoding="async" fetchpriority="${priority ? "high" : "auto"}"><span class="ck">${CHECK}</span><span class="hv">${HEART}<span>1</span></span></div>`;

export const INITIAL_HERO_CELLS = 40;
export const initialHeroHTML = Array.from({ length: INITIAL_HERO_CELLS }, (_, i) =>
  `<figure class="cell">${cellHTML(PH(i), i < 8)}</figure>`
).join("");
