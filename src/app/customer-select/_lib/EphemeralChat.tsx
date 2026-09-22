"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ColorTag } from "@/types";
import { COLOR_PALETTE } from "./real-store";
import ui from "./ui.module.css";

type ChatMessage = { id: string; color: ColorTag; text: string };

export function EphemeralChat({
  channelKey,
  currentIdentity,
  nicknames,
  hasRecipient,
  elevated = false,
}: {
  channelKey: string;
  currentIdentity: ColorTag;
  nicknames: Record<string, string>;
  hasRecipient: boolean;
  elevated?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const timers = useRef(new Map<string, number>());
  const nicknamesRef = useRef(nicknames);

  useEffect(() => {
    nicknamesRef.current = nicknames;
  }, [nicknames]);

  const showMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current.filter((item) => item.id !== message.id).slice(-2), message]);
    const previousTimer = timers.current.get(message.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      timers.current.delete(message.id);
    }, 8000);
    timers.current.set(message.id, timer);
  }, []);

  useEffect(() => {
    if (!channelKey) return;
    const activeTimers = timers.current;
    const next = supabase
      .channel(`customer-select-chat:${channelKey}`, { config: { broadcast: { ack: true } } })
      .on<ChatMessage>("broadcast", { event: "message" }, ({ payload }) => {
        const value = typeof payload?.text === "string" ? payload.text.trim() : "";
        if (!payload || typeof payload.id !== "string" || !value || value.length > 120 || !(payload.color in nicknamesRef.current)) return;
        showMessage({ ...payload, text: value });
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    setChannel(next);
    return () => {
      activeTimers.forEach(window.clearTimeout);
      activeTimers.clear();
      void supabase.removeChannel(next);
    };
  }, [channelKey, showMessage, supabase]);

  async function send() {
    const value = text.trim();
    if (!channel || !connected || !hasRecipient || !value) return;
    const message: ChatMessage = { id: crypto.randomUUID(), color: currentIdentity, text: value };
    setSendError(false);
    showMessage(message);
    setText("");
    const result = await channel.send({ type: "broadcast", event: "message", payload: message });
    if (result !== "ok") {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      const timer = timers.current.get(message.id);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(message.id);
      setSendError(true);
    }
  }

  return (
    <aside className={`${ui.ephemeralChat} ${elevated ? ui.ephemeralChatElevated : ""}`} aria-label="일회성 대화" data-chat-connected={connected}>
      <div className={ui.ephemeralMessages} aria-live="polite" aria-atomic="false">
        {messages.map((message) => <div key={message.id} className={ui.ephemeralMessage}>
          <i style={{ background: COLOR_PALETTE.find(({ id }) => id === message.color)?.hex }} />
          <span><strong>{message.color === currentIdentity ? "나" : nicknames[message.color] || "참가자"}</strong><span>{message.text}</span></span>
        </div>)}
      </div>
      {open ? <div className={ui.ephemeralComposer}>
        <div><strong>잠깐 대화하기</strong><button type="button" aria-label="대화 닫기" onClick={() => setOpen(false)}><X size={16} /></button></div>
        <p role={sendError ? "alert" : undefined}>{sendError ? "메시지를 보내지 못했어요. 다시 시도해 주세요." : hasRecipient ? "지금 접속 중인 사람에게만 8초 동안 보여요." : "함께 접속한 사람이 없어요."}</p>
        <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input autoFocus maxLength={120} value={text} onChange={(event) => setText(event.target.value)} placeholder="메시지를 입력하세요" aria-label="일회성 메시지" />
          <button type="submit" aria-label="메시지 보내기" disabled={!connected || !hasRecipient || !text.trim()}><Send size={17} /></button>
        </form>
      </div> : null}
      <button type="button" className={ui.ephemeralChatTrigger} aria-label={open ? "대화 닫기" : "대화 열기"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MessageCircle size={19} /><span>대화</span>
      </button>
    </aside>
  );
}
