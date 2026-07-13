"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Sparkles, Send, Loader2, Bot, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient, isAuthenticated } from "@/lib/api";
import { useTranslation } from "@/hooks/use-translation";
import { ReadAloudButton } from "@/components/accessibility/ReadAloudButton";
import { DictateButton } from "@/components/accessibility/DictateButton";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  offline?: boolean;
}

const LOCAL_KEY = "skillhub_ai_chat_history";
const MAX_PERSISTED_MESSAGES = 20;

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AIChatbot() {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [authed, setAuthed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthed(isAuthenticated());
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_PERSISTED_MESSAGES));
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES)),
      );
    } catch {
    }
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, isSending]);

  const send = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = { id: nowId(), role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsSending(true);

    try {
      const tail = next.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const result = await apiClient.sendAIChat({
        messages: tail,
        language,
      });
      const reply: ChatMessage = {
        id: nowId(),
        role: "assistant",
        content: result.reply || "…",
        offline: !!result.offline,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: nowId(),
          role: "assistant",
          content: err?.message || t("error.generic"),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LOCAL_KEY);
      } catch {
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("chat.close") : t("chat.open")}
        aria-expanded={open}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-cream border-2 border-espresso shadow-sticker-sm transition-transform hover:scale-105 hover:shadow-sticker focus:outline-none focus:ring-4 focus:ring-terracotta/30",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-label={t("chat.title")}
            className="fixed bottom-24 right-6 z-40 flex max-h-[70vh] w-[calc(100vw-3rem)] max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-espresso bg-cream-50 shadow-kid-lg"
          >
            <div className="flex items-center justify-between bg-espresso px-4 py-3 text-cream">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="font-semibold">{t("chat.title")}</span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    aria-label={t("chat.clear")}
                    className="rounded-full p-1 text-xs hover:bg-cream/10 text-cream/85 hover:text-cream"
                  >
                    {t("chat.clear")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close")}
                  className="rounded-full p-1 hover:bg-cream/10 text-cream/85 hover:text-cream"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-cream-100 text-sm"
            >
              {messages.length === 0 ? (
                <div className="rounded-xl bg-cream-50 border-2 border-espresso/10 p-4 text-espresso/80">
                  <p className="font-medium text-espresso mb-1">
                    {t("chat.greeting")}
                  </p>
                  <p className="text-xs text-espresso/55">{t("chat.subtitle")}</p>
                </div>
              ) : (
                messages.map((m) => <Bubble key={m.id} message={m} />)
              )}
              {isSending && (
                <div className="flex items-center gap-2 text-xs text-espresso/55">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("chat.thinking")}
                </div>
              )}
            </div>

            <div className="border-t-2 border-espresso/10 bg-cream-50 p-3">
              {!authed ? (
                <p className="text-xs text-espresso/55 text-center">
                  {t("chat.signInRequired")}
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    rows={1}
                    placeholder={t("chat.inputPlaceholder")}
                    className="flex-1 resize-none rounded-xl border-2 border-espresso/15 bg-cream-100 px-3 py-2 text-sm text-espresso placeholder:text-espresso/45 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 outline-none max-h-32"
                  />
                  <DictateButton value={input} onChange={setInput} compact />
                  <button
                    type="button"
                    onClick={send}
                    disabled={!input.trim() || isSending}
                    className="rounded-full bg-terracotta border-2 border-espresso px-3 py-2 text-cream font-semibold shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm flex-shrink-0"
                    aria-label={t("chat.send")}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const Bubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border",
          isUser
            ? "bg-cream-300 text-espresso border-espresso/15"
            : "bg-terracotta-50 text-terracotta-500 border-terracotta-200",
        )}
      >
        {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] flex flex-col gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-2 whitespace-pre-wrap",
            isUser
              ? "bg-terracotta text-cream"
              : message.offline
                ? "bg-mustard-50 text-espresso border border-mustard-200"
                : "bg-cream-50 text-espresso border-2 border-espresso/10",
          )}
        >
          {message.content}
        </div>
        {}
        {!isUser && message.content && !message.offline && (
          <ReadAloudButton text={message.content} compact />
        )}
      </div>
    </div>
  );
};
