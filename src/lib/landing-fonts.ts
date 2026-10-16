import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";

const body = IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--sl-font-body", preload: false });
const mono = IBM_Plex_Mono({ weight: "500", subsets: ["latin"], variable: "--sl-font-mono" });

/** /select·/studio 랜딩 시안의 글꼴(IBM Plex) — 루트 요소에 붙이면 CSS의 --f-body·--f-mono가 이 글꼴을 쓴다. */
export const landingFontVars = `${body.variable} ${mono.variable}`;
