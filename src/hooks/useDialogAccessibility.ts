"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const dialogStack: symbol[] = [];
let previousBodyOverflow = "";
const inertOwners = new Map<HTMLElement, { count: number; previous: boolean }>();
function isolatePortal(root: HTMLElement | null) {
  let portal = root;
  while (portal?.parentElement && portal.parentElement !== document.body) portal = portal.parentElement;
  if (!portal || portal.parentElement !== document.body) return () => {};
  const siblings = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== portal && !node.matches("script, style, link"));
  for (const node of siblings) {
    const entry = inertOwners.get(node) ?? { count: 0, previous: node.inert };
    entry.count++;
    inertOwners.set(node, entry);
    node.inert = true;
  }
  return () => {
    for (const node of siblings) {
      const entry = inertOwners.get(node);
      if (!entry || --entry.count > 0) continue;
      node.inert = entry.previous;
      inertOwners.delete(node);
    }
  };
}

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';
const visible = (element: HTMLElement) => {
  const closedDisclosure = element.closest("details:not([open])");
  if (closedDisclosure && !closedDisclosure.querySelector("summary")?.contains(element)) return false;
  return !element.closest("[hidden], [inert]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
};

/** Shared behavior for dialog shells; geometry and presentation stay with the caller. */
export function useDialogAccessibility({
  open,
  rootRef,
  onClose,
  closeDisabled = false,
}: {
  open: boolean;
  rootRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const latest = useRef({ onClose, closeDisabled });
  useLayoutEffect(() => { latest.current = { onClose, closeDisabled }; });

  useEffect(() => {
    if (!open) return;
    const key = Symbol("dialog");
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A menu may close while its portal is open; return to its disclosure trigger then.
    const returnDisclosure = returnFocus?.closest("details")?.querySelector<HTMLElement>("summary");
    if (dialogStack.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogStack.push(key);
    const releaseBackground = isolatePortal(rootRef.current);

    // Standard PhotographerModal renders responsive shells; only the visible one participates.
    const dialog = () => {
      const root = rootRef.current;
      if (!root) return undefined;
      const candidates = root.matches('[role="dialog"]') ? [root] : [...root.querySelectorAll<HTMLElement>('[role="dialog"]')];
      return candidates.find(visible);
    };
    const isTop = () => dialogStack.at(-1) === key;
    const focusables = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((item) => item.tabIndex >= 0 && !item.matches(':disabled, [aria-disabled="true"]') && !item.closest('[inert]') && visible(item));
    const focusInside = () => {
      const element = dialog();
      if (!element || !isTop()) return;
      const preferred = element.querySelector<HTMLElement>('[data-dialog-autofocus]:not(:disabled)');
      (preferred && visible(preferred) ? preferred : element).focus({ preventScroll: true });
    };
    const handleFocus = (event: FocusEvent) => {
      if (isTop() && !dialog()?.contains(event.target as Node)) focusInside();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!latest.current.closeDisabled) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const element = dialog();
      if (!element) return;
      const items = focusables(element);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        element.focus({ preventScroll: true });
      } else if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (isTop() && !dialog()?.contains(document.activeElement)) focusInside();
    };

    focusInside();
    const observer = new MutationObserver(() => {
      if (!isTop()) return;
      const active = document.activeElement;
      if (!dialog()?.contains(active) || (active instanceof HTMLElement && active.matches(":disabled"))) focusInside();
    });
    if (rootRef.current) observer.observe(rootRef.current, { childList: true, subtree: true });
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("focusin", handleFocus);
    window.addEventListener("resize", handleResize);
    return () => {
      observer.disconnect();
      const wasTop = isTop();
      dialogStack.splice(dialogStack.indexOf(key), 1);
      releaseBackground();
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("focusin", handleFocus);
      window.removeEventListener("resize", handleResize);
      if (dialogStack.length === 0) document.body.style.overflow = previousBodyOverflow;
      const restore = [returnFocus, returnDisclosure].find((element) => element?.isConnected && visible(element) && !element.matches(":disabled"));
      if (wasTop) restore?.focus({ preventScroll: true });
    };
  }, [open, rootRef]);
}
