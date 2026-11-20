import type { TimerMode } from "./settings";

export type FlowRatio = 3 | 4 | 5;

export interface LegacyTimerSettings {
  mode: TimerMode | null;
  flowRatio: FlowRatio | null;
}

const MODE_KEY = ".timerMode";
const FLOW_RATIO_KEY = "mochi.flowRatio";

export function readLegacyTimerSettings(): LegacyTimerSettings {
  try {
    const storedMode = localStorage.getItem(MODE_KEY);
    const storedRatio = localStorage.getItem(FLOW_RATIO_KEY);

    const mode: TimerMode | null = storedMode === "pomodoro" || storedMode === "flow" ? storedMode : null;

    const flowRatio: FlowRatio | null = storedRatio === "3" || storedRatio === "4" || storedRatio === "5" ? (Number(storedRatio) as FlowRatio) : null;

    return { mode, flowRatio };
  } catch (error) {
    console.warn("[Settings] Failed to read legacy timer settings:", error);
    return { mode: null, flowRatio: null };
  }
}

export function clearLegacyTimerSettings(): void {
  try {
    localStorage.removeItem(MODE_KEY);
    localStorage.removeItem(FLOW_RATIO_KEY);
  } catch (error) {
    console.warn("[Settings] Failed to clear legacy timer settings:", error);
  }
}
