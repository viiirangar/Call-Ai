"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, Radio, CircleCheck, CircleX, Sparkles, Save } from "lucide-react";
import { usePanel } from "@/components/panel/store";
import { SettingsTab } from "@/components/panel/settings-tab";
import { PersonaTab } from "@/components/panel/persona-tab";
import { TestTab } from "@/components/panel/test-tab";
import { ConversationsTab } from "@/components/panel/conversations-tab";
import { GuideTab } from "@/components/panel/guide-tab";
import { CallsTab } from "@/components/panel/calls-tab";
import { useToast } from "@/hooks/use-toast";
import { useLang, setLang, type Lang } from "@/lib/i18n";

export default function Home() {
  const { config, status, loading, error, loadConfig, refreshStatus, setEnabledRemote, dirty, save } = usePanel();
  const { toast } = useToast();
  const { lang, t } = useLang();

  useEffect(() => {
    void loadConfig();
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 10000);
    return () => clearInterval(t);
  }, [loadConfig, refreshStatus]);

  const toggleEnabled = async (v: boolean) => {
    await setEnabledRemote(v);
    toast({
      title: v ? t("enabledOnToast") : t("enabledOffToast"),
      description: v ? t("botReadyDesc") : t("messagesUnansweredDesc"),
    });
  };

  const saveAll = async () => {
    try {
      await save();
      toast({ title: t("savedTitle"), description: t("savedAllDesc") });
    } catch (e) {
      toast({
        title: t("saveFailedTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">{t("loadingPanel")}</p>
        </div>
      </main>
    );
  }

  if (error || !config) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <CircleX className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-sm">{error || t("loadFailed")}</p>
          <Button variant="outline" onClick={() => void loadConfig()}>
            {t("retry")}
          </Button>
        </div>
      </main>
    );
  }

  const worker = status?.worker;
  const isLive = !!worker?.polling && !!status?.botConnected;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-muted/40 to-background">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-6 w-6" />
          </span>
          <div className="me-auto">
            <h1 className="text-base font-bold leading-tight">{t("appTitle")}</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              {t("appSubtitle")}
            </p>
          </div>

          <div
            className="flex items-center gap-1 rounded-full border p-0.5"
            role="group"
            aria-label={t("langSwitchAria")}
          >
            {(["fr", "nl"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {isLive ? (
              <Badge variant="default" className="gap-1">
                <Radio className="h-3 w-3" />
                {t("botLive")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <CircleX className="h-3 w-3" />
                {t("botNotConnected")}
              </Badge>
            )}
            {status?.aiConfigured ? (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <Sparkles className="h-3 w-3" />
                {status.aiProvider === "groq" ? "Groq" : status.aiProvider === "gemini" ? "Gemini" : "OpenAI"}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                {t("demoMode")}
              </Badge>
            )}
            {status?.botConnected ? <CircleCheck className="h-4 w-4 text-primary" aria-label={t("tokenSavedAria")} /> : null}
          </div>

          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
            <span className="text-xs font-medium">{t("autoReplyLabel")}</span>
            <Switch checked={config.enabled} onCheckedChange={(v) => void toggleEnabled(v)} aria-label={t("autoReplyAria")} />
          </div>
        </div>
      </header>

      {/* ---- Body ---- */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        {status && !status.personaComplete ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {t("personaWarning")}
          </div>
        ) : null}

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto flex-wrap">
            <TabsTrigger value="settings" className="text-xs sm:text-sm py-2">{t("tabSettings")}</TabsTrigger>
            <TabsTrigger value="persona" className="text-xs sm:text-sm py-2">{t("tabPersona")}</TabsTrigger>
            <TabsTrigger value="calls" className="text-xs sm:text-sm py-2">{t("tabCalls")}</TabsTrigger>
            <TabsTrigger value="test" className="text-xs sm:text-sm py-2">{t("tabTest")}</TabsTrigger>
            <TabsTrigger value="conversations" className="text-xs sm:text-sm py-2">
              {t("tabConversations")}{status?.stats.conversationCount ? ` (${status.stats.conversationCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="guide" className="text-xs sm:text-sm py-2">{t("tabGuide")}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="persona" className="mt-4">
            <PersonaTab />
          </TabsContent>
          <TabsContent value="calls" className="mt-4">
            <CallsTab />
          </TabsContent>
          <TabsContent value="test" className="mt-4">
            <TestTab />
          </TabsContent>
          <TabsContent value="conversations" className="mt-4">
            <ConversationsTab />
          </TabsContent>
          <TabsContent value="guide" className="mt-4">
            <GuideTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* ---- Floating save button (when there are unsaved changes) ---- */}
      {dirty ? (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <Button
            onClick={() => void saveAll()}
            size="lg"
            className="shadow-lg pointer-events-auto"
            aria-label={t("saveAllAria")}
          >
            <Save className="h-4 w-4" />
            {t("saveChanges")}
          </Button>
        </div>
      ) : null}

      {/* ---- Footer ---- */}
      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-5xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {t("footerConversations")}: {status?.stats.conversationCount ?? 0} — {t("footerMessages")}: {status?.stats.messageCount ?? 0}
            {worker?.polling ? ` — ${t("footerProcessed")}: ${worker.processed}` : ""}
          </span>
          <span>{t("footerInstallable")} {config.replyLanguage === "fr" ? t("langFrench") : config.replyLanguage.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}
