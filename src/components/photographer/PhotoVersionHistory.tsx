"use client";

import Image from "next/image";
import { Layers } from "lucide-react";
import styles from "./PhotoVersionHistory.module.css";

export type PhotoVersionHistoryKey =
  | "original"
  | "v1"
  | "v2"
  | `history:${string}`;

export type PhotoVersionHistoryItem = {
  key: PhotoVersionHistoryKey;
  label: string;
  filename: string;
  thumbnailUrl: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "attention" | "reviewing";
  uploadedAt?: string | null;
  hasComment?: boolean;
};

type PhotoVersionHistoryProps = {
  items: PhotoVersionHistoryItem[];
  activeKey: PhotoVersionHistoryKey;
  onSelect: (key: PhotoVersionHistoryKey) => void;
  compareEnabled: boolean;
  onCompareChange: (enabled: boolean) => void;
  canCompare: boolean;
  comment: string | null;
  commentHeading?: string;
  hideMobileSecondaryControls?: boolean;
};

export function PhotoVersionHistory({
  items,
  activeKey,
  onSelect,
  compareEnabled,
  onCompareChange,
  canCompare,
  comment,
  commentHeading = "고객 코멘트",
  hideMobileSecondaryControls = false,
}: PhotoVersionHistoryProps) {
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const comparisonTarget = activeIndex >= 0 ? items[activeIndex + 1] : undefined;

  const current = items[activeIndex];
  return (
    <div data-inspector-scroll="true" className={styles.root}>
      {/* 현재 사진의 상태와 요청을 먼저 읽고, 필요할 때 이력을 탐색한다. */}
      <section className={hideMobileSecondaryControls ? styles.desktopOnly : undefined}>
        <p className={styles.caption}>현재 보는 버전</p>
        <div className={styles.current}><h2>{current?.label ?? "사진 정보"}</h2>
          {current?.statusLabel ? <span className={styles.status} data-tone={current.statusTone}>{current.statusLabel}</span> : null}
        </div>
        <div className={styles.comment}>
          <h3>{commentHeading}</h3>
          <p>{comment?.trim() || "남긴 요청이 없습니다."}</p>
        </div>
      </section>
      {canCompare && comparisonTarget ? <button type="button" aria-pressed={compareEnabled} onClick={() => onCompareChange(!compareEnabled)} className={styles.compare}>
        <Layers size={16} aria-hidden />{compareEnabled ? "비교 종료" : `${comparisonTarget.label}과 나란히 비교`}
      </button> : null}
      <div className={styles.historyHeading}><h3>버전 이력</h3><span>{items.length}개</span></div>
      <div className={styles.history}>
        {items.map(item => <button key={item.key} data-photo-version-key={item.key} type="button" aria-current={item.key === activeKey ? "true" : undefined} onClick={() => onSelect(item.key)} className={styles.item}>
          <span className={styles.thumb}><Image src={item.thumbnailUrl} alt="" fill unoptimized sizes="44px" className="object-cover" /></span>
          <span className={styles.itemText}><strong>{item.label}</strong><span className={styles.filename} title={item.filename}>{item.filename}</span>
          <span className={styles.status} data-tone={item.statusTone}>{item.statusLabel}</span></span>
        </button>)}
      </div>
    </div>
  );
}
