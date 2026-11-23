"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePanel } from "./store";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { Phone, Copy, RefreshCw, Play, Square, Loader2, Smartphone, MessageSquareText, Server, Mic, Volume2 } from "lucide-react";

interface TranscriptLine {
  who: "caller" | "bot" | "system";
  text: string;
}

interface VoiceStatus {
  voiceOnline: boolean;
  enrolled: boolean;
}

export function CallsTab() {
  const { config, patch, save, saving } = usePanel();
  const { toast } = useToast();
  const { t } = useLang();
  const [showToken, setShowToken] = useState(false);
  const [question, setQuestion] = useState("Quel est votre diplôme et avez-vous de l'expérience ?");
  const [busy, setBusy] = useState<"start" | "turn" | "end" | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const [callId, setCallId] = useState("");

  const MS_VOICES = [
    { id: "fr-FR-DeniseNeural", label: t("voiceDenise") },
    { id: "fr-FR-VivienneMultilingualNeural", label: t("voiceVivienne") },
    { id: "fr-FR-BrigitteNeural", label: t("voiceBrigitte") },
    { id: "fr-FR-HenriNeural", label: t("voiceHenri") },
    { id: "fr-FR-RemyMultilingualNeural", label: t("voiceRemy") },
    { id: "fr-FR-YvesNeural", label: t("voiceYves") },
  ];

  function randomToken(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ---- Voice of the receptionist ----
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/call/voice-status");
        const data = await res.json();
        if (!alive) return;
        setVoiceStatus({ voiceOnline: !!data.voiceOnline, enrolled: !!data.enrolled });
      } catch {
        if (!alive) return;
        setVoiceStatus({ voiceOnline: false, enrolled: false });
      }
    };
    void load();
    return () => {
      alive = false;
      const el = audioElRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
    };
  }, []);

  if (!config) return null;

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("copiedTitle"), description: label });
    } catch {
      toast({ title: t("copyFailedTitle"), description: t("copyManually"), variant: "destructive" });
    }
  };

  const saveSettings = async () => {
    try {
      await save();
      toast({ title: t("savedTitle"), description: t("savedCallDesc") });
    } catch (e) {
      toast({
        title: t("saveFailedTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  const generateToken = () => {
    const tok = randomToken();
    patch({ callApiToken: tok });
    toast({ title: t("tokenGeneratedTitle"), description: t("tokenGeneratedDesc") });
  };

  const postTurn = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/call/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.callApiToken, callId: id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.detail || `${t("errorWithStatus")} ${res.status}`);
    return data as { greeting?: string; reply?: string; goodbye?: string; disabled?: boolean };
  };

  const startCall = async () => {
    setBusy("start");
    try {
      if (!config.callApiToken) throw new Error(t("tokenFirst"));
      const id = `paneltest-${Date.now()}`;
      setCallId(id);
      setTranscript([]);
      const data = await postTurn(id, { action: "start" });
      if (data.disabled) {
        setTranscript([{ who: "system", text: t("callDisabledMsg") }]);
        setCallOpen(false);
      } else {
        setTranscript([{ who: "bot", text: data.greeting || "" }]);
        setCallOpen(true);
      }
    } catch (e) {
      setTranscript([{ who: "system", text: e instanceof Error ? e.message : t("unknownError") }]);
    } finally {
      setBusy(null);
    }
  };

  const sendQuestion = async () => {
    if (!question.trim() || !callOpen) return;
    setBusy("turn");
    const q = question.trim();
    setTranscript((tr) => [...tr, { who: "caller", text: q }]);
    setQuestion("");
    try {
      const data = await postTurn(callId, { action: "turn", text: q });
      setTranscript((tr) => [...tr, { who: "bot", text: data.reply || "" }]);
    } catch (e) {
      setTranscript((tr) => [
        ...tr,
        { who: "system", text: e instanceof Error ? e.message : t("unknownError") },
      ]);
    } finally {
      setBusy(null);
    }
  };

  const endCall = async () => {
    setBusy("end");
    try {
      const data = await postTurn(callId, { action: "end" });
      setTranscript((tr) => [...tr, { who: "bot", text: data.goodbye || "" }]);
      setCallOpen(false);
    } catch (e) {
      setTranscript((tr) => [
        ...tr,
        { who: "system", text: e instanceof Error ? e.message : t("unknownError") },
      ]);
    } finally {
      setBusy(null);
    }
  };

  // ---- Voice of the receptionist: status, recording, upload, preview ----
  const loadVoiceStatus = async () => {
    try {
      const res = await fetch("/api/call/voice-status");
      const data = await res.json();
      setVoiceStatus({ voiceOnline: !!data.voiceOnline, enrolled: !!data.enrolled });
    } catch {
      setVoiceStatus({ voiceOnline: false, enrolled: false });
    }
  };

  const stopAudio = () => {
    const el = audioElRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPreviewing(null);
  };

  const playPreview = async (voice: string, clone: boolean) => {
    try {
      stopAudio();
      setPreviewing(clone ? "clone" : voice);
      const res = await fetch(`/api/call/voice-preview?voice=${encodeURIComponent(voice)}&clone=${clone ? "1" : "0"}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `${t("errorWithStatus")} ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audioElRef.current = el;
      el.onended = () => {
        setPreviewing(null);
        URL.revokeObjectURL(url);
      };
      await el.play();
    } catch (e) {
      setPreviewing(null);
      toast({
        title: t("playFailTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  const uploadSample = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/call/voice-sample", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; error?: string; duration?: number };
      if (!res.ok || !data.ok) throw new Error(data?.error || `${t("errorWithStatus")} ${res.status}`);
      toast({
        title: t("sampleUploadedTitle"),
        description: `${t("sampleUploadedDesc")} ${data.duration ?? "?"} ${t("sampleUploadedDesc2")}`,
      });
      await loadVoiceStatus();
    } catch (e) {
      toast({
        title: t("uploadFailTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm";
        void uploadSample(new File([blob], `sample.${ext}`, { type: blob.type }));
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast({ title: t("micDenied"), variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    mediaRecorderRef.current?.stop();
  };

  return (
    <div className="space-y-5">
      {/* ---- System explanation ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-primary" />
            {t("howTitle")}
          </CardTitle>
          <CardDescription>
            {t("howDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1.5 pe-5">
            <li>{t("how1")}</li>
            <li>{t("how2")}</li>
            <li>{t("how3")}</li>
            <li>{t("how4")}</li>
            <li>{t("how5")}</li>
            <li>{t("how6")}</li>
          </ol>
          <div className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("androidNote")}
          </div>
        </CardContent>
      </Card>

      {/* ---- Connecting the app to the server ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-5 w-5 text-primary" />
            {t("connectAppTitle")}
          </CardTitle>
          <CardDescription>{t("connectAppDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serverUrl">{t("serverUrlLabel")}</Label>
            <div className="flex gap-2">
              <Input id="serverUrl" dir="ltr" readOnly value={serverUrl} className="font-mono text-sm" />
              <Button variant="outline" size="sm" type="button" onClick={() => void copy(serverUrl, t("serverUrlCopied"))}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="callApiToken">{t("callTokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="callApiToken"
                type={showToken ? "text" : "password"}
                dir="ltr"
                placeholder={t("noTokenPlaceholder")}
                value={config.callApiToken}
                onChange={(e) => patch({ callApiToken: e.target.value })}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="sm" type="button" onClick={() => setShowToken((v) => !v)}>
                {showToken ? t("hide") : t("show")}
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => void copy(config.callApiToken, t("tokenCopied"))}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={generateToken}>
                <RefreshCw className="h-4 w-4" />
                {t("genToken")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("tokenWarning")}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{t("callEnabledTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("callEnabledDesc")}</p>
            </div>
            <div className="flex items-center gap-2">
              {config.callEnabled ? (
                <Badge variant="default" className="gap-1">
                  <Phone className="h-3 w-3" /> {t("active")}
                </Badge>
              ) : (
                <Badge variant="secondary">{t("off")}</Badge>
              )}
              <Switch
                checked={config.callEnabled}
                onCheckedChange={(v) => patch({ callEnabled: v })}
                aria-label={t("callSwitchAria")}
              />
            </div>
          </div>

          <Button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("saveCallBtn")}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Fixed French call phrases ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-5 w-5 text-primary" />
            {t("fixedPhrasesTitle")}
          </CardTitle>
          <CardDescription>{t("fixedPhrasesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="callGreeting">{t("greetingLabel")}</Label>
            <Textarea
              id="callGreeting"
              dir="ltr"
              rows={2}
              value={config.callGreeting}
              onChange={(e) => patch({ callGreeting: e.target.value })}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="callGoodbye">{t("goodbyeLabel")}</Label>
            <Textarea
              id="callGoodbye"
              dir="ltr"
              rows={2}
              value={config.callGoodbye}
              onChange={(e) => patch({ callGoodbye: e.target.value })}
              className="text-sm"
            />
          </div>
          <Button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("savePhrasesBtn")}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Voice of the receptionist ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="h-5 w-5 text-primary" />
            {t("voiceTitle")}
          </CardTitle>
          <CardDescription>
            {t("voiceDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex flex-wrap items-center gap-2">
            {voiceStatus ? (
              <>
                <Badge variant={voiceStatus.voiceOnline ? "default" : "destructive"}>
                  {voiceStatus.voiceOnline ? t("voiceOnline") : t("voiceOffline")}
                </Badge>
                <Badge variant={voiceStatus.enrolled ? "default" : "secondary"}>
                  {voiceStatus.enrolled ? t("sampleEnrolled") : t("sampleNotEnrolled")}
                </Badge>
              </>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>

          {/* Voice mode selection */}
          <RadioGroup
            value={config.callVoiceMode || "clone"}
            onValueChange={(v) => patch({ callVoiceMode: v as "clone" | "ms" | "phone" })}
            className="gap-3"
          >
            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <RadioGroupItem value="clone" id="vm-clone" className="mt-1" />
              <div>
                <Label htmlFor="vm-clone" className="font-medium">{t("cloneTitle")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("cloneDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <RadioGroupItem value="ms" id="vm-ms" className="mt-1" />
              <div>
                <Label htmlFor="vm-ms" className="font-medium">{t("msTitle")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("msDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <RadioGroupItem value="phone" id="vm-phone" className="mt-1" />
              <div>
                <Label htmlFor="vm-phone" className="font-medium">{t("phoneTitle")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("phoneDesc")}
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* Voice sample — clone mode only */}
          {config.callVoiceMode === "clone" ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 px-3 py-3">
              <p className="text-sm font-medium">{t("sampleTitle")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("sampleDesc")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {recording ? (
                  <Button size="sm" variant="destructive" onClick={stopRecording}>
                    <Square className="h-4 w-4" />
                    {t("stopRec")} ({recSeconds} {t("secondsUnit")})
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => void startRecording()} disabled={uploading}>
                    <Mic className="h-4 w-4" />
                    {t("recMic")}
                  </Button>
                )}
                <Label
                  htmlFor="voiceSampleFile"
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("chooseFile")}
                </Label>
                <input
                  id="voiceSampleFile"
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  disabled={uploading || recording}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadSample(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {voiceStatus?.enrolled ? (
                <Button size="sm" variant="outline" onClick={() => void playPreview(config.callVoiceName, true)}>
                  {previewing === "clone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {t("previewMine")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Microsoft base voice */}
          {config.callVoiceMode !== "phone" ? (
            <div className="space-y-2">
              <Label htmlFor="callVoiceName">{t("baseVoiceLabel")}</Label>
              <div className="flex gap-2">
                <select
                  id="callVoiceName"
                  dir="ltr"
                  value={config.callVoiceName || "fr-FR-DeniseNeural"}
                  onChange={(e) => patch({ callVoiceName: e.target.value })}
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {MS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => void playPreview(config.callVoiceName || MS_VOICES[0].id, false)}
                >
                  {previewing === (config.callVoiceName || MS_VOICES[0].id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {t("previewBtn")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("voicesLegend")}
                {config.callVoiceMode === "clone" ? t("legendCloneSuffix") : ""}
              </p>
            </div>
          ) : null}

          <Button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("saveVoiceBtn")}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Call simulator ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-primary" />
            {t("callSimTitle")}
          </CardTitle>
          <CardDescription>
            {t("callSimDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void startCall()} disabled={busy !== null || callOpen}>
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("startCall")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void endCall()} disabled={busy !== null || !callOpen}>
              {busy === "end" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              {t("endCall")}
            </Button>
          </div>

          {callOpen ? (
            <div className="flex gap-2">
              <Input
                dir="ltr"
                placeholder={t("callerQPlaceholder")}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void sendQuestion();
                }}
                className="text-sm"
              />
              <Button onClick={() => void sendQuestion()} disabled={busy !== null || !question.trim()}>
                {busy === "turn" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("send")}
              </Button>
            </div>
          ) : null}

          {transcript.length ? (
            <>
              <Separator />
              <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                {transcript.map((line, i) => (
                  <div key={i} className="text-sm">
                    {line.who === "caller" ? (
                      <p className="text-foreground" dir="ltr">
                        <span className="me-2 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          {t("callerTag")}
                        </span>
                        {line.text}
                      </p>
                    ) : line.who === "bot" ? (
                      <p dir="ltr" className="font-medium text-primary">
                        <span className="me-2 inline-block rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          {t("receptionistTag")}
                        </span>
                        {line.text}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{line.text}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- Android app installation ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5 text-primary" />
            {t("installTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>{t("install1")}</p>
          <p>{t("install2")}</p>
          <p>{t("install3")}</p>
          <p>{t("install4")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
