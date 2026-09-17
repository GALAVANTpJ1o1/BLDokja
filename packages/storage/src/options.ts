/**
 * The settings' fixed option lists, with no schema code attached, so a page can read them without loading
 * Zod (`@bld/storage/options`). schema.ts builds its enums from these.
 */
export const THEMES = ["system", "dark", "light"] as const;
export const COLOURWAYS = ["slate", "jade", "coral", "cotton", "ocean", "forest"] as const;
export const ENVIRONMENTS = ["none", "galaxy", "rain", "snow", "forest", "ocean"] as const;
export const PALETTES = ["standard", "high-contrast", "deuteranopia"] as const;
export const VOICES = ["plain", "tsundere", "casual", "roast"] as const;
export const CUBE_VIEWS = ["3d", "net", "text"] as const;
