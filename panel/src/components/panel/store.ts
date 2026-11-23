"use client";

import { create } from "zustand";
import type { BotConfigData } from "@/lib/types";

export interface WorkerStatus {
  online: boolean;
  polling: boolean;
  lastUpdateAt: string | null;
  lastError: string | null;
  processed: number;
}

export interface StatusData {
  botConnected: boolean;
  botUsername: string;
  aiConfigured: boolean;
  aiProvider: string;
  enabled: boolean;
  ownerSet: boolean;
  personaComplete: boolean;
  replyLanguage: string;
  worker: WorkerStatus;
  stats: { conversationCount: number; messageCount: number };
}

interface PanelStore {
  config: BotConfigData | null;
  status: StatusData | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
  loadConfig: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  patch: (p: Partial<BotConfigData>) => void;
  save: () => Promise<boolean>;
  setEnabledRemote: (enabled: boolean) => Promise<void>;
}

export const usePanel = create<PanelStore>((set, get) => ({
  config: null,
  status: null,
  loading: true,
  saving: false,
  dirty: false,
  error: null,

  loadConfig: async () => {
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (!res.ok) throw new Error(`Erreur lors du chargement des réglages (${res.status})`);
      const data = await res.json();
      set({ config: data, loading: false, error: null, dirty: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  },

  refreshStatus: async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      set({ status: data });
    } catch {
      // silencieux — nouvelle tentative au prochain tour
    }
  },

  patch: (p) => {
    const cur = get().config;
    if (!cur) return;
    set({ config: { ...cur, ...p }, dirty: true });
  },

  save: async () => {
    const cur = get().config;
    if (!cur) return false;
    set({ saving: true });
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cur),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Échec de l'enregistrement");
      set({ config: data, saving: false, dirty: false });
      void get().refreshStatus();
      return true;
    } catch (e) {
      set({ saving: false });
      throw e;
    }
  },

  setEnabledRemote: async (enabled) => {
    const cur = get().config;
    if (!cur) return;
    set({ config: { ...cur, enabled } });
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        void get().refreshStatus();
      }
    } catch {
      // le toast est géré dans le composant
    }
  },
}));
