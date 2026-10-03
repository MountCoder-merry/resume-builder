import type { InsetsMm, PageSize, ThemeModel } from "../../types/resume";
import { CURRENT_RESUME_SCHEMA_VERSION } from "../../types/resume";

export const CURRENT_SCHEMA_VERSION = CURRENT_RESUME_SCHEMA_VERSION;
export const DEFAULT_LOCALE = "zh-CN";
export const DEFAULT_TEMPLATE_ID = "editorial";

export const DEFAULT_PAGE_SIZE: PageSize = {
  preset: "A4",
  orientation: "portrait",
  widthMm: 210,
  heightMm: 297,
};

export const DEFAULT_PAGE_MARGINS: InsetsMm = {
  top: 18,
  right: 18,
  bottom: 18,
  left: 18,
};

export const DEFAULT_THEME: ThemeModel = {
  id: "theme_editorial",
  templateId: DEFAULT_TEMPLATE_ID,
  version: 1,
  palette: {
    background: "#fffef9",
    surface: "#fafaf7",
    text: "#1c1c1a",
    mutedText: "#77766f",
    accent: "#8173ff",
    border: "#deded7",
  },
  typography: {
    bodyFont: "Inter",
    headingFont: "Georgia",
    baseSizePt: 10.5,
    scale: 1.2,
  },
  spacingUnitMm: 4,
  radiusMm: 2,
  atsFriendly: true,
  userOverrides: {},
};

export const DEFAULT_SNAP_SETTINGS = {
  enabled: true,
  gridMm: 2,
  showGuides: true,
} as const;
