import { createContext, useContext } from "react";
import type { AppSettings } from "../lib/settings";

export interface SettingsContextValue {
  settings: AppSettings | null;
  loaded: boolean;
  saving: boolean;
  error: string | null;

  updateSettings: (updater: (current: AppSettings) => AppSettings) => void;

  replaceSettings: (settings: AppSettings) => void;
  reloadSettings: () => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider.");
  }

  return context;
}
