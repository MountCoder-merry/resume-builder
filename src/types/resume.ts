/**
 * V2 resume domain model.
 *
 * This file intentionally contains data contracts only. It must stay free of
 * DOM, React, browser storage, and renderer-specific types.
 */

export const CURRENT_RESUME_SCHEMA_VERSION = 1 as const;

export type ResumeSchemaVersion = number;
export type ISODateTime = string;
export type LocaleCode = string;

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ResumeDocumentId = Brand<string, "ResumeDocumentId">;
export type ResumeRevision = Brand<number, "ResumeRevision">;
export type SectionId = Brand<string, "SectionId">;
export type SectionItemId = Brand<string, "SectionItemId">;
export type ContentBlockId = Brand<string, "ContentBlockId">;
export type LayoutNodeId = Brand<string, "LayoutNodeId">;
export type PageId = Brand<string, "PageId">;
export type AssetId = Brand<string, "AssetId">;
export type VersionId = Brand<string, "VersionId">;
export type ImportResultId = Brand<string, "ImportResultId">;
export type SuggestionId = Brand<string, "SuggestionId">;

export type LocalizedText = {
  /** Locale used when a requested translation is missing. */
  defaultLocale: LocaleCode;
  /** Plain text only. Rich HTML is deliberately not part of the model. */
  values: Partial<Record<LocaleCode, string>>;
};

export type ContentSource = {
  kind: "user" | "import" | "ai" | "template";
  sourceId?: string;
  createdAt: ISODateTime;
};

export type LocalizedContent = LocalizedText & {
  sourceByLocale?: Partial<Record<LocaleCode, ContentSource>>;
};

export type DateRange = {
  start?: string;
  end?: string;
  isCurrent?: boolean;
  display?: LocalizedText;
};

export type Link = {
  id: string;
  label: LocalizedText;
  url: string;
};

export type AssetRef = {
  assetId: AssetId;
  alt?: LocalizedText;
  mimeType?: string;
  width?: number;
  height?: number;
};

export type ContactPoint = {
  id: string;
  type: "email" | "phone" | "location" | "website" | "social" | "other";
  label?: LocalizedText;
  value: LocalizedText;
  url?: string;
  visible: boolean;
};

export type ProfileContent = {
  name: LocalizedContent;
  headline?: LocalizedContent;
  summary?: LocalizedContent;
  contacts: ContactPoint[];
  links: Link[];
  avatar?: AssetRef;
};

export type ExperienceItem = {
  id: SectionItemId;
  role: LocalizedContent;
  company: LocalizedContent;
  location?: LocalizedContent;
  period: DateRange;
  bullets: LocalizedContent[];
  links: Link[];
};

export type EducationItem = {
  id: SectionItemId;
  institution: LocalizedContent;
  degree?: LocalizedContent;
  fieldOfStudy?: LocalizedContent;
  location?: LocalizedContent;
  period: DateRange;
  details: LocalizedContent[];
};

export type ProjectItem = {
  id: SectionItemId;
  name: LocalizedContent;
  role?: LocalizedContent;
  description?: LocalizedContent;
  period?: DateRange;
  bullets: LocalizedContent[];
  links: Link[];
};

export type SkillItem = {
  id: SectionItemId;
  name: LocalizedContent;
  level?: "beginner" | "intermediate" | "advanced" | "expert";
  keywords: string[];
};

export type CertificationItem = {
  id: SectionItemId;
  name: LocalizedContent;
  issuer?: LocalizedContent;
  issuedAt?: string;
  expiresAt?: string;
  credentialUrl?: string;
};

export type LanguageItem = {
  id: SectionItemId;
  language: LocalizedContent;
  proficiency?: LocalizedContent;
};

export type CustomContentBlock = {
  id: ContentBlockId;
  kind: "paragraph" | "heading" | "list" | "quote";
  text: LocalizedContent;
  items?: LocalizedContent[];
};

type SectionBase = {
  id: SectionId;
  title: LocalizedContent;
  visible: boolean;
  /** Used for semantic ordering; visual placement belongs to LayoutModel. */
  itemOrder: SectionItemId[];
};

export type ExperienceSection = SectionBase & {
  type: "experience";
  items: Record<string, ExperienceItem>;
};

export type EducationSection = SectionBase & {
  type: "education";
  items: Record<string, EducationItem>;
};

export type ProjectSection = SectionBase & {
  type: "projects";
  items: Record<string, ProjectItem>;
};

export type SkillsSection = SectionBase & {
  type: "skills";
  items: Record<string, SkillItem>;
};

export type CertificationSection = SectionBase & {
  type: "certifications";
  items: Record<string, CertificationItem>;
};

export type LanguagesSection = SectionBase & {
  type: "languages";
  items: Record<string, LanguageItem>;
};

export type CustomSection = Omit<SectionBase, "itemOrder"> & {
  type: "custom";
  blockOrder: ContentBlockId[];
  blocks: Record<string, CustomContentBlock>;
};

export type ResumeSection =
  | ExperienceSection
  | EducationSection
  | ProjectSection
  | SkillsSection
  | CertificationSection
  | LanguagesSection
  | CustomSection;

export type ContentModel = {
  profile: ProfileContent;
  sections: Record<string, ResumeSection>;
  /** Stable semantic order, independent from page placement. */
  sectionOrder: SectionId[];
  assets: Record<string, AssetRef>;
};

export type PagePreset = "A4" | "LETTER" | "LEGAL" | "CUSTOM";
export type PageOrientation = "portrait" | "landscape";

export type PageSize = {
  preset: PagePreset;
  orientation: PageOrientation;
  widthMm: number;
  heightMm: number;
};

export type InsetsMm = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type RectMm = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutMode = "flow" | "freeform";

export type ContentBinding =
  | { kind: "profile"; field: "name" | "headline" | "summary" | "contacts" }
  | { kind: "section"; sectionId: SectionId }
  | { kind: "section-item"; sectionId: SectionId; itemId: SectionItemId }
  | { kind: "content-block"; blockId: ContentBlockId };

export type NodeStyle = {
  fontFamilyToken?: string;
  fontSizePt?: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  lineHeight?: number;
  colorToken?: string;
  backgroundToken?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  paddingMm?: InsetsMm;
};

type LayoutNodeBase = {
  id: LayoutNodeId;
  pageId: PageId;
  bounds: RectMm;
  rotationDeg: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  style: NodeStyle;
};

export type SectionLayoutNode = LayoutNodeBase & {
  kind: "section";
  binding: Extract<ContentBinding, { kind: "section" }>;
};

export type SectionItemLayoutNode = LayoutNodeBase & {
  kind: "section-item";
  binding: Extract<ContentBinding, { kind: "section-item" }>;
};

export type TextLayoutNode = LayoutNodeBase & {
  kind: "text";
  binding: Extract<ContentBinding, { kind: "profile" | "content-block" }>;
};

export type ImageLayoutNode = LayoutNodeBase & {
  kind: "image";
  assetId: AssetId;
  fit: "contain" | "cover";
};

export type DividerLayoutNode = LayoutNodeBase & {
  kind: "divider";
  orientation: "horizontal" | "vertical";
};

export type ShapeLayoutNode = LayoutNodeBase & {
  kind: "shape";
  shape: "rectangle" | "circle" | "line";
};

export type LayoutNode =
  | SectionLayoutNode
  | SectionItemLayoutNode
  | TextLayoutNode
  | ImageLayoutNode
  | DividerLayoutNode
  | ShapeLayoutNode;

export type PageBackground = {
  colorToken?: string;
  assetId?: AssetId;
};

export type PageModel = {
  id: PageId;
  size: PageSize;
  margins: InsetsMm;
  background: PageBackground;
  nodeOrder: LayoutNodeId[];
  allowOverflow: boolean;
};

export type SnapSettings = {
  enabled: boolean;
  gridMm: number;
  showGuides: boolean;
};

export type LayoutModel = {
  mode: LayoutMode;
  templateId: string;
  pageOrder: PageId[];
  pages: Record<string, PageModel>;
  nodes: Record<string, LayoutNode>;
  snap: SnapSettings;
};

export type ColorPalette = {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  border: string;
};

export type TypographyTheme = {
  bodyFont: string;
  headingFont: string;
  baseSizePt: number;
  scale: number;
};

export type ThemeModel = {
  id: string;
  templateId: string;
  version: number;
  palette: ColorPalette;
  typography: TypographyTheme;
  spacingUnitMm: number;
  radiusMm: number;
  atsFriendly: boolean;
  userOverrides: Partial<Pick<ThemeModel, "palette" | "typography" | "spacingUnitMm" | "radiusMm">>;
};

export type JobTarget = {
  title?: LocalizedText;
  company?: LocalizedText;
  description?: LocalizedText;
  keywords: string[];
};

export type DocumentMetadata = {
  title: LocalizedText;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  variantOf?: ResumeDocumentId;
  jobTarget?: JobTarget;
};

export type ResumeDocument = {
  schemaVersion: ResumeSchemaVersion;
  documentId: ResumeDocumentId;
  revision: ResumeRevision;
  defaultLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  metadata: DocumentMetadata;
  content: ContentModel;
  layout: LayoutModel;
  theme: ThemeModel;
};

export type ResumeDocumentSnapshot = ResumeDocument;

export type JsonPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string };

export type ContentPath =
  | `content.profile.${string}`
  | `content.sections.${string}`
  | `content.assets.${string}`;

export type UpdateProfileFieldCommand = {
  type: "profile.update";
  payload:
    | { field: "name" | "headline" | "summary"; value?: LocalizedContent }
    | { field: "contacts"; value: ContactPoint[] }
    | { field: "links"; value: Link[] };
};

export type AddExperienceCommand = {
  type: "experience.add";
  payload: { sectionId: SectionId; item: ExperienceItem; index?: number };
};

export type UpdateExperienceCommand = {
  type: "experience.update";
  payload: { sectionId: SectionId; itemId: SectionItemId; changes: Partial<Omit<ExperienceItem, "id">> };
};

export type RemoveExperienceCommand = {
  type: "experience.remove";
  payload: { sectionId: SectionId; itemId: SectionItemId };
};

export type MoveExperienceCommand = {
  type: "experience.move";
  payload: { sectionId: SectionId; itemId: SectionItemId; toIndex: number };
};

export type AddEducationCommand = {
  type: "education.add";
  payload: { sectionId: SectionId; item: EducationItem; index?: number };
};

export type UpdateEducationCommand = {
  type: "education.update";
  payload: { sectionId: SectionId; itemId: SectionItemId; changes: Partial<Omit<EducationItem, "id">> };
};

export type RemoveEducationCommand = {
  type: "education.remove";
  payload: { sectionId: SectionId; itemId: SectionItemId };
};

export type AddProjectCommand = {
  type: "project.add";
  payload: { sectionId: SectionId; item: ProjectItem; index?: number };
};

export type UpdateProjectCommand = {
  type: "project.update";
  payload: { sectionId: SectionId; itemId: SectionItemId; changes: Partial<Omit<ProjectItem, "id">> };
};

export type RemoveProjectCommand = {
  type: "project.remove";
  payload: { sectionId: SectionId; itemId: SectionItemId };
};

export type AddSkillSectionCommand = {
  type: "skills-section.add";
  payload: { section: SkillsSection; index?: number };
};

export type UpdateSkillSectionCommand = {
  type: "skills-section.update";
  payload: { sectionId: SectionId; changes: Partial<Omit<SkillsSection, "id" | "type">> };
};

export type RemoveSkillSectionCommand = {
  type: "skills-section.remove";
  payload: { sectionId: SectionId };
};

export type MoveSectionCommand = {
  type: "section.move";
  payload: { sectionId: SectionId; toIndex: number };
};

export type ResumeCommand =
  | { type: "content-patch"; patches: JsonPatchOperation[]; paths: ContentPath[] }
  | { type: "layout-patch"; patches: JsonPatchOperation[] }
  | { type: "theme-patch"; patches: JsonPatchOperation[] }
  | { type: "page-patch"; patches: JsonPatchOperation[] }
  | UpdateProfileFieldCommand
  | AddExperienceCommand
  | UpdateExperienceCommand
  | RemoveExperienceCommand
  | MoveExperienceCommand
  | AddEducationCommand
  | UpdateEducationCommand
  | RemoveEducationCommand
  | AddProjectCommand
  | UpdateProjectCommand
  | RemoveProjectCommand
  | AddSkillSectionCommand
  | UpdateSkillSectionCommand
  | RemoveSkillSectionCommand
  | MoveSectionCommand;

export type HistoryEntry = {
  id: VersionId;
  revisionBefore: ResumeRevision;
  revisionAfter: ResumeRevision;
  command: ResumeCommand;
  inverseCommand: ResumeCommand;
  createdAt: ISODateTime;
  label?: string;
};

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
};

export type VersionKind =
  | "autosave"
  | "manual"
  | "import"
  | "ai-suggestion"
  | "job-variant";

export type VersionModel = {
  id: VersionId;
  documentId: ResumeDocumentId;
  revision: ResumeRevision;
  kind: VersionKind;
  label?: string;
  createdAt: ISODateTime;
  parentVersionId?: VersionId;
  snapshot: ResumeDocumentSnapshot;
  changeSummary?: string[];
};

export type ImportSource = {
  kind: "pdf" | "docx" | "txt" | "image" | "paste";
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
};

export type ImportCandidateTarget =
  | ContentPath
  | `content.sections.${string}.items.${string}`;

export type ImportCandidate = {
  id: string;
  target: ImportCandidateTarget;
  value: string | string[];
  confidence: number;
  evidence: {
    text: string;
    startOffset?: number;
    endOffset?: number;
  };
  status: "pending" | "accepted" | "rejected";
};

export type ImportResult = {
  id: ImportResultId;
  source: ImportSource;
  status: "queued" | "extracting" | "needs-review" | "accepted" | "failed";
  detectedLocales: LocaleCode[];
  rawText?: string;
  candidates: ImportCandidate[];
  warnings: string[];
  errors: string[];
  createdAt: ISODateTime;
};

export type AiContentSuggestion = {
  id: SuggestionId;
  target: ContentPath;
  locale: LocaleCode;
  original: string;
  proposed: string;
  rationale: string;
  evidence: string[];
  status: "pending" | "accepted" | "rejected";
  createdAt: ISODateTime;
};

export type EditorUiState = {
  activeLocale: LocaleCode;
  activePageId?: PageId;
  selectedNodeIds: LayoutNodeId[];
  zoom: number;
  showGuides: boolean;
  pendingImportId?: ImportResultId;
  pendingSuggestionIds: SuggestionId[];
};

export type ResumeApplicationState = {
  documents: Record<string, ResumeDocument>;
  activeDocumentId: ResumeDocumentId;
  historyByDocument: Record<string, HistoryState>;
  versionsByDocument: Record<string, VersionModel[]>;
  imports: Record<string, ImportResult>;
  suggestions: Record<string, AiContentSuggestion>;
  ui: EditorUiState;
};

export type ResumeMigration = {
  fromVersion: ResumeSchemaVersion;
  toVersion: ResumeSchemaVersion;
  migrate(input: unknown): ResumeDocument;
};
