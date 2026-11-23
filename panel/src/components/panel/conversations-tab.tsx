"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, MessagesSquare, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

interface ConvItem {
  id: string;
  telegramChatId: string;
  contactName: string;
  audienceMode: string;
  lastAudience: string;
  needsAttention: boolean;
  messageCount: number;
  lastMessageAt: string;
  lastMessage: string;
  lastRole: string;
}

interface ConvDetail {
  id: string;
  contactName: string;
  telegramChatId: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}

function timeLocalized(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ConversationsTab() {
  const { toast } = useToast();
  const { t, lang } = useLang();
  const [items, setItems] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ConvDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConvItem | null>(null);

  const AUDIENCE_LABELS: Record<string, string> = {
    auto: t("audienceAutoShort"),
    customer: t("audienceCustomerShort"),
    friend: t("audienceFriendShort"),
    colleague: t("audienceColleagueShort"),
    unknown: t("audienceUnknownShort"),
  };

  const locale = lang === "nl" ? "nl-BE" : "fr-FR";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailLoading(false);
    }
  };

  const setAudienceMode = async (id: string, mode: string) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, audienceMode: mode } : c)));
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceMode: mode }),
      });
      toast({ title: t("toneSavedTitle"), description: `${t("toneSavedDesc")} « ${AUDIENCE_LABELS[mode] || mode} »` });
    } catch {
      toast({ title: t("errorTitle"), description: t("toneSaveFailed"), variant: "destructive" });
    }
  };

  const removeConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((c) => c.id !== id));
      toast({ title: t("deletedTitle"), description: t("deletedDesc") });
    } catch {
      toast({ title: t("errorTitle"), description: t("deleteFailed"), variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("convDesc")}
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} aria-label={t("refreshAria")}>
          <RefreshCw className="h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t("noConvTitle")}</p>
            <p className="text-xs">
              {t("noConvSub")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="font-medium text-sm hover:underline text-start"
                    onClick={() => void openDetail(c.id)}
                  >
                    {c.contactName || `${t("userLabel")} ${c.telegramChatId}`}
                  </button>
                  <Badge variant={c.lastAudience === "unknown" ? "secondary" : "default"}>
                    {AUDIENCE_LABELS[c.lastAudience] || c.lastAudience}
                  </Badge>
                  {c.needsAttention ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {t("needsAttention")}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground ms-auto">{timeLocalized(c.lastMessageAt, locale)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2" dir="auto">
                  {c.lastMessage || "—"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={c.audienceMode} onValueChange={(v) => void setAudienceMode(c.id, v)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t("toneAuto")}</SelectItem>
                      <SelectItem value="customer">{t("toneCustomerOpt")}</SelectItem>
                      <SelectItem value="friend">{t("toneFriendOpt")}</SelectItem>
                      <SelectItem value="colleague">{t("toneColleagueOpt")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{c.messageCount} {t("messagesCount")}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ms-auto h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}
                    aria-label={`${t("deleteConvAria")} ${c.contactName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Full conversation ---- */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.contactName || detail?.telegramChatId}</DialogTitle>
            <DialogDescription>{t("fullConvDesc")}</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ScrollArea className="scroll-thin max-h-[55vh] pe-2">
              <div className="space-y-3">
                {detail?.messages.map((m) =>
                  m.role === "system_note" ? (
                    <p key={m.id} className="text-center text-[11px] text-muted-foreground py-1">
                      {m.content}
                    </p>
                  ) : (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          m.role === "user" ? "bg-secondary" : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <p dir="auto" className={m.role === "assistant" ? "ltr-content whitespace-pre-wrap" : "whitespace-pre-wrap"}>
                          {m.content}
                        </p>
                        <p className="mt-1 text-[10px] opacity-70">{timeLocalized(m.createdAt, locale)}</p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Delete confirmation ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDesc")} « {deleteTarget?.contactName} » {t("deleteDesc2")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && void removeConversation(deleteTarget.id)}
            >
              {t("deleteBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
