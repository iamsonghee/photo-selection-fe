"use client";

import type { ReactNode } from "react";
import { BrandLogoBar } from "@/components/BrandLogo";
import styles from "./CustomerEntryShell.module.css";

export function CustomerEntryShell({
  children,
  className = "",
  layout = "mobile",
}: {
  children: ReactNode;
  className?: string;
  layout?: "mobile" | "responsive" | "auth";
}) {
  return (
    <div className={`${styles.viewport} ${layout === "auth" ? styles.authViewport : ""} ${layout === "responsive" ? styles.responsiveViewport : ""}`}>
      <div
        data-customer-entry-layout={layout}
        className={`${styles.canvas} ${layout === "auth" ? styles.authCanvas : ""} ${layout === "responsive" ? styles.responsiveCanvas : ""} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function CustomerEntryHeader({
  href,
  overlay = false,
}: {
  href?: string;
  overlay?: boolean;
}) {
  return (
    <header className={`${styles.header} ${overlay ? styles.headerOverlay : ""}`}>
      <BrandLogoBar size="md" href={href} variant="customerEntry" />
    </header>
  );
}
