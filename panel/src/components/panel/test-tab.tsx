"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SendHorizonal, Eraser, FlaskConical, Loader2 } from "lucide-react";
import { usePanel } from "./store";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

interface TestMsg {
  role: "user" | "assistant";
  content: string;
  detected?: string;
  provider?: string;
}

export function TestTab() {
  const { config, status } = usePanel();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const [messages, setMessages] = useState<TestMsg[]>([]);
  const [input, setInput] = useState("");
  const [audience, setAudience] = useState<"auto" | "customer" | "friend" | "colleague">("auto");
  const [contactName, setContactName] = useState("Marie");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const AUDIENCE_LABELS: Record<string, string> = {
    auto: t("audienceAuto"),
    customer: t("audienceCustomer"),
    friend: t("audienceFriend"),
    colleague: t("audienceColleague"),
  };

  const DETECTED_LABELS: Record<string, string> = {
    customer: t("detectedCustomer"),
    friend: t("detectedFriend"),
    colleague: t("detectedColleague"),
    unknown: t("detectedUnknown"),
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, audience, history, contactName }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply, detected: data.detectedAudience, provider: data.providerUsed },
        ]);
      } else {
        toast({ title: t("errorReplyTitle"), description: data.error || data.detail, variant: "destructive" });
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      }
    } catch (e) {
      toast({
        title: t("networkError"),
        description: e instanceof Error ? e.message : t("serverDisconnected"),
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const providerBadge = () => {
    const p = status?.aiProvider || config?.aiProvider || "demo";
    if (p === "demo") return { label: t("demoBadge"), variant: "secondary" as const };
    if (p === "gemini") return { label: "Gemini", variant: "default" as const };
    if (p === "groq") return { label: "Groq", variant: "default" as const };
    return { label: "OpenAI-compatible", variant: "default" as const };
  };

  const pb = providerBadge();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FlaskConical className="h-5 w-5 text-primary" />
            {t("simulatorTitle")}
            <Badge variant={pb.variant}>{pb.label}</Badge>
          </CardTitle>
          <CardDescription>
            {t("simulatorDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("whoLabel")}</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("autoDetectOption")}</SelectItem>
                  <SelectItem value="customer">{t("audienceCustomer")}</SelectItem>
                  <SelectItem value="friend">{t("audienceFriend")}</SelectItem>
                  <SelectItem value="colleague">{t("audienceColleague")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">{t("senderNameLabel")}</Label>
              <Input
                id="contactName"
                dir="ltr"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Marie"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="scroll-thin max-h-[420px] min-h-[280px] overflow-y-auto p-4 space-y-3"
            aria-label={t("chatWindowAria")}
          >
            {messages.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 text-muted-foreground text-sm">
                <p>{t("emptyHint1")}</p>
                <p className="text-xs">{t("emptyHint2")}</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-secondary text-secondary-foreground rounded-br-md"
                        : "bg-primary text-primary-foreground rounded-bl-md"
                    }`}
                  >
                    <p dir="auto" className={m.role === "assistant" ? "ltr-content whitespace-pre-wrap" : "whitespace-pre-wrap"}>
                      {m.content}
                    </p>
                    {m.role === "assistant" && m.detected ? (
                      <p dir="ltr" className="mt-1.5 text-[10px] opacity-80 text-left">
                        {DETECTED_LABELS[m.detected] || ""}
                        {m.provider ? ` — ${m.provider}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex justify-end">
                <div className="bg-primary/90 text-primary-foreground rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="typing-dot h-2 w-2 rounded-full bg-current inline-block" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-current inline-block" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-current inline-block" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t p-3 flex items-center gap-2">
            <Input
              dir="auto"
              placeholder={t("messagePlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
              aria-label={t("testMsgAria")}
            />
            <Button onClick={send} disabled={sending || !input.trim()} size="icon" aria-label={t("sendAria")}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMessages([])}
              aria-label={t("clearAria")}
              disabled={sending}
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1" key={lang}>
        {t("testNote")} {AUDIENCE_LABELS[audience]} {t("testNoteActive")}
      </p>
    </div>
  );
}
