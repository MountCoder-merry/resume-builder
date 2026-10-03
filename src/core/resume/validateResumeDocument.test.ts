import { describe, expect, it } from "vitest";
import type { ExperienceItem, LayoutNodeId, PageId, ProjectItem, SectionId, SectionItemId } from "../../types/resume";
import { createDefaultResumeDocument } from "./createResumeDocument";
import { validateResumeDocument } from "./validateResumeDocument";

describe("validateResumeDocument", () => {
  it("accepts a normal default document and warns about empty sections", () => {
    const document = createDefaultResumeDocument();
    const result = validateResumeDocument(document);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.code === "EMPTY_SECTION")).toBe(true);
  });

  it("detects duplicate section and item IDs", () => {
    const document = createDefaultResumeDocument();
    const sectionIds = Object.keys(document.content.sections);
    const firstSection = document.content.sections[sectionIds[0]];
    const secondKey = sectionIds[1];
    document.content.sections[secondKey] = { ...structuredClone(firstSection), id: firstSection.id };

    const result = validateResumeDocument(document);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "SECTION_ID_DUPLICATE")).toBe(true);

    const experience = Object.values(document.content.sections).find((section) => section.type === "experience");
    if (!experience || experience.type !== "experience") throw new Error("Missing experience section in fixture.");
    const duplicateExperience: ExperienceItem = {
      id: "item_duplicate" as SectionItemId,
      role: { defaultLocale: "zh-CN", values: { "zh-CN": "设计师" } },
      company: { defaultLocale: "zh-CN", values: { "zh-CN": "公司" } },
      period: {},
      bullets: [],
      links: [],
    };
    experience.items[duplicateExperience.id] = duplicateExperience;
    experience.itemOrder.push(duplicateExperience.id);
    const other = Object.values(document.content.sections).find((section) => section.type === "projects");
    if (!other || other.type !== "projects") throw new Error("Missing project section in fixture.");
    const duplicateProject: ProjectItem = {
      id: duplicateExperience.id,
      name: duplicateExperience.role,
      bullets: [],
      links: [],
    };
    other.items[duplicateProject.id] = duplicateProject;
    other.itemOrder.push(duplicateProject.id);
    const itemResult = validateResumeDocument(document);
    expect(itemResult.errors.some((error) => error.code === "ITEM_ID_DUPLICATE")).toBe(true);
  });

  it("detects invalid binding, page references, locale, schema, and bounds", () => {
    const document = createDefaultResumeDocument();
    const firstPageId = document.layout.pageOrder[0];
    const firstPage = document.layout.pages[firstPageId];
    const firstNodeId = firstPage.nodeOrder[0];
    const firstNode = document.layout.nodes[firstNodeId];
    if (firstNode.kind !== "section") throw new Error("Expected a section node.");
    firstNode.binding.sectionId = "missing-section" as SectionId;
    firstPage.nodeOrder.push("missing-node" as LayoutNodeId);
    firstNode.bounds.x = 205;
    document.defaultLocale = "en-US";
    document.schemaVersion = 999;

    const result = validateResumeDocument(document);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "SECTION_BINDING_MISSING",
      "PAGE_NODE_REFERENCE_INVALID",
      "DEFAULT_LOCALE_NOT_SUPPORTED",
      "SCHEMA_VERSION_UNSUPPORTED",
      "BOUNDS_OUTSIDE_PAGE",
    ]));
  });

  it("accepts multiple pages when page and node references are consistent", () => {
    const document = createDefaultResumeDocument();
    const firstPageId = document.layout.pageOrder[0];
    const secondPageId = "page_second" as PageId;
    document.layout.pages[secondPageId] = {
      id: secondPageId,
      size: { preset: "A4", orientation: "portrait", widthMm: 210, heightMm: 297 },
      margins: { top: 18, right: 18, bottom: 18, left: 18 },
      background: { colorToken: "background" },
      nodeOrder: [],
      allowOverflow: false,
    };
    document.layout.pageOrder.push(secondPageId);
    expect(document.layout.pageOrder).toContain(firstPageId);
    expect(validateResumeDocument(document).valid).toBe(true);
  });
});
