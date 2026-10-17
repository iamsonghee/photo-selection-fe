"use client";

import { useId, useState, type ReactNode } from "react";
import "./business-info.css";

export function BusinessInfo({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <div className="landing-footer-links">
      {children}
      <span aria-hidden="true">·</span>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        사업자 정보 <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <span aria-hidden="true">·</span>
      <span>문의 <a href="mailto:multihatter@gmail.com">multihatter@gmail.com</a></span>
    </div>
    <p id={id} hidden={!open} className="landing-business-info">상호: 순한설기 · 대표: 심효순 · 사업자등록번호: 890-18-01386 · 주소: 경기도 여주시 영릉로35-12 · 전화: 031-885-4355</p>
  </>;
}
