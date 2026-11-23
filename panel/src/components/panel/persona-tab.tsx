"use client";

import { Loader2, Plus, Trash2, UserRound, MessageCircle, BookOpen, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePanel } from "./store";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

export function PersonaTab() {
  const { config, patch, save, saving, dirty } = usePanel();
  const { toast } = useToast();
  const { t } = useLang();

  if (!config) return null;

  const handleSave = async () => {
    try {
      await save();
      toast({ title: t("savedTitle"), description: t("savedPersonaDesc") });
    } catch (e) {
      toast({
        title: t("saveFailedTitle"),
        description: e instanceof Error ? e.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  const updateFaq = (idx: number, field: "q" | "a", value: string) => {
    const faqs = config.faqs.map((f, i) => (i === idx ? { ...f, [field]: value } : f));
    patch({ faqs });
  };

  const addFaq = () => {
    patch({ faqs: [...config.faqs, { q: "", a: "" }] });
  };

  const removeFaq = (idx: number) => {
    patch({ faqs: config.faqs.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      {/* ---- Identity ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-5 w-5 text-primary" />
            {t("personaTabTitle")}
          </CardTitle>
          <CardDescription>
            {t("personaTabDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ownerName">{t("ownerNameLabel")}</Label>
            <Input
              id="ownerName"
              placeholder={t("ownerNamePlaceholder")}
              value={config.ownerName}
              onChange={(e) => patch({ ownerName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personality">{t("personalityLabel")}</Label>
            <Textarea
              id="personality"
              rows={3}
              placeholder={t("personalityPlaceholder")}
              value={config.personality}
              onChange={(e) => patch({ personality: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessInfo">{t("businessLabel")}</Label>
            <Textarea
              id="businessInfo"
              rows={4}
              placeholder={t("businessPlaceholder")}
              value={config.businessInfo}
              onChange={(e) => patch({ businessInfo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("businessHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---- Tone per audience ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            {t("toneTitle")}
          </CardTitle>
          <CardDescription>
            {t("toneDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="toneCustomer">{t("toneCustomerLabel")}</Label>
            <Textarea
              id="toneCustomer"
              rows={2}
              dir="ltr"
              placeholder="Professionnel, poli et efficace. Toujours courtois, réponses claires sur les prix et les délais."
              value={config.toneCustomer}
              onChange={(e) => patch({ toneCustomer: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toneFriend">{t("toneFriendLabel")}</Label>
            <Textarea
              id="toneFriend"
              rows={2}
              dir="ltr"
              placeholder="Décontracté, chaleureux, blagues légères. Langage familier acceptable."
              value={config.toneFriend}
              onChange={(e) => patch({ toneFriend: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toneColleague">{t("toneColleagueLabel")}</Label>
            <Textarea
              id="toneColleague"
              rows={2}
              dir="ltr"
              placeholder="Direct et pragmatique. On parle travail, projets et organisation."
              value={config.toneColleague}
              onChange={(e) => patch({ toneColleague: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("toneHint")}
          </p>
        </CardContent>
      </Card>

      {/* ---- FAQ ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-primary" />
            {t("faqTitle")}
          </CardTitle>
          <CardDescription>
            {t("faqDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noFaqs")}</p>
          ) : (
            <div className="space-y-4">
              {config.faqs.map((f, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">{t("questionLabel")} {i + 1}</span>
                    <Input
                      dir="ltr"
                      placeholder="Combien coûte la livraison ?"
                      value={f.q}
                      onChange={(e) => updateFaq(i, "q", e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFaq(i)}
                      aria-label={`${t("deleteQuestionAria")} ${i + 1}`}
                      className="shrink-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    dir="ltr"
                    rows={2}
                    placeholder="La livraison est offerte à partir de 50€ d'achat, sinon 4,90€ partout en France."
                    value={f.a}
                    onChange={(e) => updateFaq(i, "a", e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={addFaq} size="sm">
            <Plus className="h-4 w-4" />
            {t("addQuestion")}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Extra details ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-5 w-5 text-primary" />
            {t("extraTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="extra">{t("extraLabel")}</Label>
            <Textarea
              id="extra"
              rows={3}
              placeholder={t("extraPlaceholder")}
              value={config.extraInstructions}
              onChange={(e) => patch({ extraInstructions: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="signature">{t("signatureLabel")}</Label>
              <Input
                id="signature"
                dir="ltr"
                placeholder="— Arash"
                value={config.signature}
                onChange={(e) => patch({ signature: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fallback">{t("fallbackLabel")}</Label>
              <Input
                id="fallback"
                dir="ltr"
                value={config.fallbackMessage}
                onChange={(e) => patch({ fallbackMessage: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t("fallbackHint")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-start">
        <Button onClick={handleSave} disabled={saving || !dirty} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? t("savingBtn") : t("savePersonaBtn")}
        </Button>
      </div>
    </div>
  );
}
