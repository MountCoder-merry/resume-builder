import type {
  ContentModel,
  ExperienceSection,
  LayoutModel,
  LayoutNode,
  LocalizedContent,
  PageModel,
  ProjectSection,
  ResumeDocument,
  ResumeDocumentId,
  ResumeRevision,
  ResumeSection,
  SectionId,
  SkillsSection,
  EducationSection,
} from "../../types/resume";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_LOCALE,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SNAP_SETTINGS,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_THEME,
} from "./constants";

export type ResumeFactoryOptions = {
  locale?: string;
  now?: () => string;
  idFactory?: (prefix: string) => string;
};

const defaultNow = (): string => new Date().toISOString();
let fallbackSequence = 0;

export const createEntityId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackSequence.toString(36)}`;
};

const asDocumentId = (value: string): ResumeDocumentId => value as ResumeDocumentId;
const asRevision = (value: number): ResumeRevision => value as ResumeRevision;
const asSectionId = (value: string): SectionId => value as SectionId;

const generatedId = (idFactory: (prefix: string) => string, prefix: string): string => {
  const value = idFactory(prefix);
  if (typeof value !== "string" || value.trim().length === 0) throw new RangeError(`idFactory must return a non-empty string for ${prefix}.`);
  return value;
};

const validTimestamp = (value: string, field: string): string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new RangeError(`${field} must return a valid ISO timestamp.`);
  return value;
};

const localText = (locale: string, value = ""): LocalizedContent => ({
  defaultLocale: locale,
  values: { [locale]: value },
  sourceByLocale: {},
});

const resolveOptions = (input?: string | ResumeFactoryOptions): Required<ResumeFactoryOptions> => {
  const options = typeof input === "string" ? { locale: input } : input ?? {};
  const locale = options.locale ?? DEFAULT_LOCALE;
  if (typeof locale !== "string" || locale.trim().length === 0) throw new RangeError("locale must be a non-empty string.");
  return {
    locale,
    now: options.now ?? defaultNow,
    idFactory: options.idFactory ?? createEntityId,
  };
};

const createPage = (idFactory: (prefix: string) => string): PageModel => {
  const id = generatedId(idFactory, "page") as PageModel["id"];
  return {
    id,
    size: { ...DEFAULT_PAGE_SIZE },
    margins: { ...DEFAULT_PAGE_MARGINS },
    background: { colorToken: "background" },
    nodeOrder: [],
    allowOverflow: false,
  };
};

const createEmptyContent = (locale: string): ContentModel => ({
  profile: {
    name: localText(locale),
    headline: localText(locale),
    summary: localText(locale),
    contacts: [],
    links: [],
  },
  sections: {},
  sectionOrder: [],
  assets: {},
});

const createEmptyLayout = (page: PageModel): LayoutModel => ({
  mode: "flow",
  templateId: DEFAULT_TEMPLATE_ID,
  pageOrder: [page.id],
  pages: { [page.id]: page },
  nodes: {},
  snap: { ...DEFAULT_SNAP_SETTINGS },
});

const createSectionNode = (
  page: PageModel,
  sectionId: SectionId,
  idFactory: (prefix: string) => string,
  y: number,
): LayoutNode => ({
  id: idFactory("node") as LayoutNode["id"],
  pageId: page.id,
  kind: "section",
  binding: { kind: "section", sectionId },
  bounds: { x: page.margins.left, y, width: page.size.widthMm - page.margins.left - page.margins.right, height: 28 },
  rotationDeg: 0,
  zIndex: 0,
  locked: false,
  visible: true,
  style: {},
});

const createSection = (
  type: ResumeSection["type"],
  idFactory: (prefix: string) => string,
  locale: string,
): ResumeSection => {
  const id = asSectionId(idFactory("section"));
  const base = { id, title: localText(locale), visible: true };
  if (type === "experience") return { ...base, type, itemOrder: [], items: {} } satisfies ExperienceSection;
  if (type === "education") return { ...base, type, itemOrder: [], items: {} } satisfies EducationSection;
  if (type === "projects") return { ...base, type, itemOrder: [], items: {} } satisfies ProjectSection;
  if (type === "skills") return { ...base, type, itemOrder: [], items: {} } satisfies SkillsSection;
  throw new Error(`Unsupported default section type: ${type}`);
};

export function createEmptyResumeDocument(input?: string | ResumeFactoryOptions): ResumeDocument {
  const options = resolveOptions(input);
  const page = createPage(options.idFactory);
  const documentId = generatedId(options.idFactory, "document");
  if (documentId === page.id) throw new RangeError("idFactory returned duplicate IDs for document and page.");
  const now = validTimestamp(options.now(), "now");
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentId: asDocumentId(documentId),
    revision: asRevision(0),
    defaultLocale: options.locale,
    supportedLocales: [options.locale],
    metadata: {
      title: localText(options.locale, "未命名简历"),
      createdAt: now,
      updatedAt: now,
    },
    content: createEmptyContent(options.locale),
    layout: createEmptyLayout(page),
    theme: structuredClone(DEFAULT_THEME),
  };
}

export function createDefaultResumeDocument(input?: string | ResumeFactoryOptions): ResumeDocument {
  const options = resolveOptions(input);
  const document = createEmptyResumeDocument(options);
  const usedIds = new Set<string>([
    document.documentId,
    ...document.layout.pageOrder,
  ]);
  const scopedIdFactory = (prefix: string): string => {
    const id = generatedId(options.idFactory, prefix);
    if (usedIds.has(id)) throw new RangeError(`idFactory returned duplicate id ${id}.`);
    usedIds.add(id);
    return id;
  };
  const page = document.layout.pages[document.layout.pageOrder[0]];
  const types: ResumeSection["type"][] = ["experience", "education", "projects", "skills"];
  let y = page.margins.top + 34;
  for (const type of types) {
    const section = createSection(type, scopedIdFactory, options.locale);
    document.content.sections[section.id] = section;
    document.content.sectionOrder.push(section.id);
    const node = createSectionNode(page, section.id, scopedIdFactory, y);
    document.layout.nodes[node.id] = node;
    page.nodeOrder.push(node.id);
    y += 34;
  }
  document.metadata.title = localText(options.locale, "我的简历");
  return structuredClone(document);
}

export type CloneResumeOptions = ResumeFactoryOptions & {
  documentId?: ResumeDocumentId;
  variantOf?: ResumeDocumentId;
};

export function cloneResumeDocument(document: ResumeDocument, input: CloneResumeOptions = {}): ResumeDocument {
  const options = resolveOptions(input);
  const clone = structuredClone(document);
  const now = options.now();
  const nextId = input.documentId ?? asDocumentId(generatedId(options.idFactory, "document"));
  if (typeof nextId !== "string" || nextId.trim().length === 0) throw new RangeError("documentId must be a non-empty string.");
  clone.documentId = nextId;
  clone.revision = asRevision(0);
  clone.metadata = {
    ...clone.metadata,
    createdAt: validTimestamp(now, "now"),
    updatedAt: validTimestamp(now, "now"),
    variantOf: input.variantOf ?? document.documentId,
  };
  return clone;
}
