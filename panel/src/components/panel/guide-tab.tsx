"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLang } from "@/lib/i18n";
import { BookMarked, Bot, KeyRound, SlidersHorizontal, IdCard, Smartphone, Rocket, ShieldAlert } from "lucide-react";

export function GuideTab() {
  const { t } = useLang();

  const steps = [
    {
      icon: Bot,
      title: t("guideS1Title"),
      items: [t("guideS1I1"), t("guideS1I2"), t("guideS1I3"), t("guideS1I4"), t("guideS1I5"), t("guideS1I6")],
    },
    {
      icon: KeyRound,
      title: t("guideS2Title"),
      items: [t("guideS2I1"), t("guideS2I2"), t("guideS2I3"), t("guideS2I4"), t("guideS2I5")],
    },
    {
      icon: SlidersHorizontal,
      title: t("guideS3Title"),
      items: [t("guideS3I1"), t("guideS3I2"), t("guideS3I3"), t("guideS3I4")],
    },
    {
      icon: IdCard,
      title: t("guideS4Title"),
      items: [t("guideS4I1"), t("guideS4I2"), t("guideS4I3"), t("guideS4I4")],
    },
    {
      icon: Smartphone,
      title: t("guideS5Title"),
      items: [t("guideS5I1"), t("guideS5I2"), t("guideS5I3")],
    },
    {
      icon: Rocket,
      title: t("guideS6Title"),
      items: [t("guideS6I1"), t("guideS6I2"), t("guideS6I3"), t("guideS6I4")],
    },
  ];

  const faqs = [
    { q: t("guideFaqQ1"), a: t("guideFaqA1") },
    { q: t("guideFaqQ2"), a: t("guideFaqA2") },
    { q: t("guideFaqQ3"), a: t("guideFaqA3") },
  ];

  return (
    <div className="space-y-5">
      <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-5 w-5" />
            {t("guideWarningTitle")}
          </CardTitle>
          <CardDescription className="text-amber-800/90 dark:text-amber-200/90">
            {t("guideWarningDesc")}
          </CardDescription>
        </CardHeader>
      </Card>

      {steps.map((s, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <s.icon className="h-4.5 w-4.5" />
              </span>
              {s.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {s.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-sm leading-6">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                    {j + 1}
                  </span>
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-5 w-5 text-primary" />
            {t("guideFaqTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {faqs.map((f, i) => (
            <div key={i}>
              {i > 0 ? <Separator className="mb-4" /> : null}
              <Badge variant="secondary" className="mb-1.5">{f.q}</Badge>
              <p className="text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
