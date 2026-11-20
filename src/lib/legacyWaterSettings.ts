import type { WaterMode } from "./settings";

export interface LegacyWaterSettings {
  enabled: boolean;
  mode: WaterMode;
  intervalMin: number;
  goalMl: number;
  glassMl: number;
  startHour: number;
  endHour: number;
}

const STORAGE_KEY = "notchboo.water";

const DEFAULTS: LegacyWaterSettings = {
  enabled: true,
  mode: "smart",
  intervalMin: 60,
  goalMl: 2000,
  glassMl: 250,
  startHour: 8,
  endHour: 21,
};

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function readLegacyWaterSettings(): LegacyWaterSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const value = parsed as Record<string, unknown>;

    const startHour = typeof value.startHour === "number" && Number.isFinite(value.startHour) ? clampInt(value.startHour, 0, 20) : DEFAULTS.startHour;

    const endHour = typeof value.endHour === "number" && Number.isFinite(value.endHour) ? clampInt(value.endHour, startHour + 4, 24) : Math.max(DEFAULTS.endHour, startHour + 4);

    const validGlassSizes = [150, 250, 350, 500];

    return {
      enabled: value.enabled !== false,
      mode: value.mode === "fixed" ? "fixed" : "smart",
      intervalMin: typeof value.intervalMin === "number" && Number.isFinite(value.intervalMin) && value.intervalMin > 0 ? clampInt(value.intervalMin, 1, 1440) : DEFAULTS.intervalMin,
      goalMl: typeof value.goalMl === "number" && Number.isFinite(value.goalMl) ? clampInt(value.goalMl, 1000, 4000) : DEFAULTS.goalMl,
      glassMl: validGlassSizes.includes(value.glassMl as number) ? (value.glassMl as number) : DEFAULTS.glassMl,
      startHour,
      endHour,
    };
  } catch (error) {
    console.warn("[Settings] Failed to read legacy water settings:", error);

    return null;
  }
}
