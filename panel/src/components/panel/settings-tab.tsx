"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { usePanel } from "./store";
import { DEFAULT_MODELS, LANGUAGES } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { Bot, Sparkles, Settings2, Loader2, ExternalLink, Link2, LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Berlin",
  "Europe/London",
  "Asia/Tehran",
  "UTC",
];

export function SettingsTab() {
  const { config, patch, save, status, refreshStatus, saving } = usePanel();
  const { toast } = useToast();
  const { t } = useLang();
  const [connecting, setConnecting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  if (!config) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: config.botToken }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: t("connectedToastTitle"), description: data.message, variant: "default" });
        await refreshStatus();
        await usePanel.getState().loadConfig();
      } else {
        toast({ title: t("connectFailedTitle"), description: data.error || data.detail, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: t("networkError"),
        description: e instanceof Error ? e.message : t("serverConnectFailed"),
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await fetch("/api/telegram/disconnect", { method: "POST" });
      await refreshStatus();
      toast({ title: t("stoppedTitle"), description: t("stoppedDesc") });
    } catch {
      toast({ title: t("errorTitle"), description: t("stopFailed"), variant: "destructive" });
    }
  };

  const handleSave = async () => {
    try {
      await save();
      toast({ title: t("savedTitle"), description: t("savedSettingsDesc") });
    } catch (e) {
      toast({
        title: t("saveFailedTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  const worker = status?.worker;

  return (
    <div className="space-y-5">
      {/* ---- Telegram connection ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            {t("connectBotTitle")}
          </CardTitle>
          <CardDescription>
            {t("connectBotDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="botToken">{t("botTokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="botToken"
                type={showToken ? "text" : "password"}
                dir="ltr"
                placeholder="123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={config.botToken}
                onChange={(e) => patch({ botToken: e.target.value })}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="sm" type="button" onClick={() => setShowToken((v) => !v)}>
                {showToken ? t("hide") : t("show")}
              </Button>
            </div>
            {config.botUsername ? (
              <p className="text-xs text-muted-foreground">
                {t("currentBot")} <span className="font-medium text-foreground" dir="ltr">{config.botUsername}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={connect} disabled={connecting || !config.botToken}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {connecting ? t("connectingBtn") : t("connectStartBtn")}
            </Button>
            {worker?.polling ? (
              <Button variant="outline" onClick={disconnect}>
                <LinkIcon className="h-4 w-4" />
                {t("stopReplies")}
              </Button>
            ) : null}
            <Badge variant={worker?.polling ? "default" : "secondary"}>
              {worker?.polling ? t("listening") : t("inactive")}
            </Badge>
          </div>

          {worker?.online && !worker.polling ? (
            <p className="text-xs text-muted-foreground">
              {t("serviceAvailableHint")}
            </p>
          ) : null}
          {worker?.lastError ? (
            <p className="text-xs text-destructive">{t("lastErrorLabel")} {worker.lastError}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- AI service ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("aiServiceTitle")}
          </CardTitle>
          <CardDescription>
            {t("aiServiceDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("providerLabel")}</Label>
            <Select
              value={config.aiProvider}
              onValueChange={(v) =>
                patch({ aiProvider: v as typeof config.aiProvider, aiModel: DEFAULT_MODELS[v] || "" })
              }
            >
              <SelectTrigger dir="ltr" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demo">{t("providerDemo")}</SelectItem>
                <SelectItem value="gemini">{t("providerGemini")}</SelectItem>
                <SelectItem value="groq">{t("providerGroq")}</SelectItem>
                <SelectItem value="openai">{t("providerOpenai")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.aiProvider !== "demo" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="aiKey">{t("apiKeyLabel")}</Label>
                <Input
                  id="aiKey"
                  type="password"
                  dir="ltr"
                  placeholder={config.aiProvider === "gemini" ? "AIza..." : "gsk_..."}
                  value={config.aiApiKey}
                  onChange={(e) => patch({ aiApiKey: e.target.value })}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {config.aiProvider === "gemini" ? (
                    <>
                      {t("freeKey")}{" "}
                      <a className="underline text-primary inline-flex items-center gap-0.5" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                        aistudio.google.com/apikey <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  ) : config.aiProvider === "groq" ? (
                    <>
                      {t("freeKey")}{" "}
                      <a className="underline text-primary inline-flex items-center gap-0.5" href="https://console.groq.com/apikey" target="_blank" rel="noreferrer">
                        console.groq.com/apikey <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  ) : (
                    t("openrouterHint")
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="aiModel">{t("modelLabel")}</Label>
                  <Input
                    id="aiModel"
                    dir="ltr"
                    placeholder={DEFAULT_MODELS[config.aiProvider] || ""}
                    value={config.aiModel}
                    onChange={(e) => patch({ aiModel: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                {config.aiProvider === "openai" ? (
                  <div className="space-y-2">
                    <Label htmlFor="aiBaseUrl">{t("baseUrlLabel")}</Label>
                    <Input
                      id="aiBaseUrl"
                      dir="ltr"
                      placeholder="https://openrouter.ai/api/v1"
                      value={config.aiBaseUrl}
                      onChange={(e) => patch({ aiBaseUrl: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("demoHint")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---- Behavior ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-5 w-5 text-primary" />
            {t("autoReplyLabel")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("replyLanguageLabel")}</Label>
              <Select value={config.replyLanguage} onValueChange={(v) => patch({ replyLanguage: v })}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerId">{t("ownerTelegramIdLabel")}</Label>
              <Input
                id="ownerId"
                dir="ltr"
                placeholder={t("ownerIdPlaceholder")}
                value={config.ownerTelegramId}
                onChange={(e) => patch({ ownerTelegramId: e.target.value.replace(/[^0-9]/g, "") })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("ownerIdHint")}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">{t("hideAiLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("hideAiDesc")}
              </p>
            </div>
            <Switch
              checked={config.hideAiIdentity}
              onCheckedChange={(v) => patch({ hideAiIdentity: v })}
              aria-label={t("hideAiLabel")}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">{t("workHoursLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("workHoursDesc")}</p>
            </div>
            <Switch
              checked={config.workHoursEnabled}
              onCheckedChange={(v) => patch({ workHoursEnabled: v })}
              aria-label={t("workHoursLabel")}
            />
          </div>

          {config.workHoursEnabled ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="wStart">{t("fromLabel")}</Label>
                  <Input
                    id="wStart"
                    type="time"
                    dir="ltr"
                    value={config.workStart}
                    onChange={(e) => patch({ workStart: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wEnd">{t("toLabel")}</Label>
                  <Input
                    id="wEnd"
                    type="time"
                    dir="ltr"
                    value={config.workEnd}
                    onChange={(e) => patch({ workEnd: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("timezoneLabel")}</Label>
                  <Select value={config.timezone} onValueChange={(v) => patch({ timezone: v })}>
                    <SelectTrigger dir="ltr" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz} dir="ltr">
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="awayMsg">{t("awayMsgLabel")}</Label>
                <Textarea
                  id="awayMsg"
                  dir="ltr"
                  rows={2}
                  value={config.awayMessage}
                  onChange={(e) => patch({ awayMessage: e.target.value })}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <Button onClick={handleSave} disabled={saving || !usePanel.getState().dirty} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? t("savingBtn") : t("saveSettingsBtn")}
        </Button>
      </div>
    </div>
  );
}
