export interface WorkbenchPlatformPreferences {
  accessibilityMode: boolean;
  keepAwake: boolean;
  reducedMotion: boolean;
  version: 1;
}

export const DEFAULT_PLATFORM_PREFERENCES: WorkbenchPlatformPreferences = {
  accessibilityMode: false,
  keepAwake: false,
  reducedMotion: false,
  version: 1,
};

export function parsePlatformPreferences(
  value: string | null,
): WorkbenchPlatformPreferences {
  if (!value) return DEFAULT_PLATFORM_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Partial<WorkbenchPlatformPreferences>;
    return {
      accessibilityMode: parsed.accessibilityMode === true,
      keepAwake: parsed.keepAwake === true,
      reducedMotion: parsed.reducedMotion === true,
      version: 1,
    };
  } catch {
    return DEFAULT_PLATFORM_PREFERENCES;
  }
}
