// ---- Types de données partagés du projet ----

export type Audience = "customer" | "friend" | "colleague" | "unknown";

export const AUDIENCES: Record<Audience, { label: string; fr: string }> = {
  customer: { label: "client", fr: "un client" },
  friend: { label: "ami / connaissance", fr: "un ami" },
  colleague: { label: "collègue", fr: "un collègue" },
  unknown: { label: "inconnu", fr: "une personne" },
};

export interface FaqItem {
  q: string;
  a: string;
}

export interface BotConfigData {
  // Connexion Telegram
  botToken: string;
  botUsername: string;
  ownerTelegramId: string;
  webhookSecret: string;
  // Intelligence artificielle
  aiProvider: "demo" | "gemini" | "groq" | "openai";
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  // Comportement
  enabled: boolean;
  replyLanguage: string;
  timezone: string;
  workHoursEnabled: boolean;
  workStart: string;
  workEnd: string;
  awayMessage: string;
  hideAiIdentity: boolean;
  maxHistory: number;
  // Personnalité
  ownerName: string;
  businessInfo: string;
  personality: string;
  toneCustomer: string;
  toneFriend: string;
  toneColleague: string;
  extraInstructions: string;
  faqs: FaqItem[];
  signature: string;
  fallbackMessage: string;
  // Répondeur d'appels téléphoniques
  callApiToken: string;
  callEnabled: boolean;
  callGreeting: string;
  callGoodbye: string;
  callVoiceMode: "clone" | "ms" | "phone";
  callVoiceName: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "fr", name: "Français" },
  { code: "en", name: "Anglais" },
  { code: "de", name: "Allemand" },
  { code: "es", name: "Espagnol" },
  { code: "it", name: "Italien" },
  { code: "fa", name: "Persan" },
  { code: "ar", name: "Arabe" },
];

export const LANGUAGE_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  es: "español",
  it: "italiano",
  fa: "persan",
  ar: "arabe",
};

export const DEFAULT_MODELS: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openai: "gpt-4o-mini",
  demo: "glm-4-flash",
};
