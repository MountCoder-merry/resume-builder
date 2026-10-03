import type {
  EducationSection,
  ExperienceSection,
  ProjectSection,
  ResumeDocument,
  ResumeRevision,
  ResumeSection,
  SectionId,
  SectionItemId,
  SkillsSection,
} from "../../../types/resume";
import { commandError } from "./errors";

export const cloneDocument = (document: ResumeDocument): ResumeDocument => structuredClone(document);

export const bumpRevision = (document: ResumeDocument): void => {
  document.revision = (document.revision + 1) as ResumeRevision;
  document.metadata.updatedAt = new Date().toISOString();
};

export const sectionAt = (document: ResumeDocument, sectionId: SectionId): ResumeSection => {
  const section = document.content.sections[sectionId];
  if (!section) commandError("SECTION_NOT_FOUND", `Section ${sectionId} was not found.`, `content.sections.${sectionId}`);
  return section;
};

export const experienceSectionAt = (document: ResumeDocument, sectionId: SectionId): ExperienceSection => {
  const section = sectionAt(document, sectionId);
  if (section.type !== "experience") commandError("SECTION_TYPE_MISMATCH", "The target section is not an experience section.", `content.sections.${sectionId}`);
  return section as ExperienceSection;
};

export const educationSectionAt = (document: ResumeDocument, sectionId: SectionId): EducationSection => {
  const section = sectionAt(document, sectionId);
  if (section.type !== "education") commandError("SECTION_TYPE_MISMATCH", "The target section is not an education section.", `content.sections.${sectionId}`);
  return section as EducationSection;
};

export const projectSectionAt = (document: ResumeDocument, sectionId: SectionId): ProjectSection => {
  const section = sectionAt(document, sectionId);
  if (section.type !== "projects") commandError("SECTION_TYPE_MISMATCH", "The target section is not a project section.", `content.sections.${sectionId}`);
  return section as ProjectSection;
};

export const skillsSectionAt = (document: ResumeDocument, sectionId: SectionId): SkillsSection => {
  const section = sectionAt(document, sectionId);
  if (section.type !== "skills") commandError("SECTION_TYPE_MISMATCH", "The target section is not a skills section.", `content.sections.${sectionId}`);
  return section as SkillsSection;
};

export const assertItemIdAvailable = (document: ResumeDocument, itemId: SectionItemId): void => {
  for (const section of Object.values(document.content.sections)) {
    if (section.type !== "custom" && itemId in section.items) {
      commandError("ITEM_ID_DUPLICATE", `Item ${itemId} already exists.`, `content.sections.${section.id}.items.${itemId}`);
    }
  }
};

export const assertSectionIdAvailable = (document: ResumeDocument, sectionId: SectionId): void => {
  if (document.content.sections[sectionId]) commandError("SECTION_ID_DUPLICATE", `Section ${sectionId} already exists.`, `content.sections.${sectionId}`);
};

export const assertValidIndex = (index: number | undefined, length: number, field: string): number => {
  const resolved = index ?? length;
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > length) commandError("INDEX_INVALID", `${field} must be an integer between 0 and ${length}.`, field);
  return resolved;
};

export const moveId = <T>(order: T[], id: T, toIndex: number, path: string): number => {
  const fromIndex = order.indexOf(id);
  if (fromIndex < 0) commandError("ITEM_NOT_FOUND", `Item ${String(id)} was not found.`, path);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= order.length) commandError("INDEX_INVALID", "Move target must be inside the current order.", path);
  order.splice(fromIndex, 1);
  order.splice(toIndex, 0, id);
  return fromIndex;
};

export const hasLayoutBinding = (document: ResumeDocument, sectionId: SectionId): boolean =>
  Object.values(document.layout.nodes).some((node) =>
    node.kind === "section"
      ? node.binding.sectionId === sectionId
      : node.kind === "section-item"
        ? node.binding.sectionId === sectionId
        : false,
  );

export const hasItemLayoutBinding = (document: ResumeDocument, sectionId: SectionId, itemId: SectionItemId): boolean =>
  Object.values(document.layout.nodes).some((node) =>
    node.kind === "section-item" && node.binding.sectionId === sectionId && node.binding.itemId === itemId,
  );
