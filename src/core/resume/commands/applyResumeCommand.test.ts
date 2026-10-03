import { describe, expect, it } from "vitest";
import type {
  ContactPoint,
  ContentPath,
  EducationItem,
  ExperienceItem,
  LayoutNodeId,
  ProjectItem,
  ResumeDocument,
  ResumeSection,
  SectionId,
  SectionItemId,
  SkillsSection,
} from "../../../types/resume";
import { createDefaultResumeDocument } from "../createResumeDocument";
import { ResumeCommandError } from "./errors";
import { applyResumeCommand } from "./applyResumeCommand";

const localeContent = (value: string) => ({
  defaultLocale: "zh-CN",
  values: { "zh-CN": value, "en-US": value },
});

const itemId = (value: string): SectionItemId => value as SectionItemId;
const sectionId = (value: string): SectionId => value as SectionId;

const getSection = <T extends ResumeSection["type"]>(document: ResumeDocument, type: T): Extract<ResumeSection, { type: T }> => {
  const section = Object.values(document.content.sections).find((candidate) => candidate.type === type);
  if (!section || section.type !== type) throw new Error(`Missing ${type} section.`);
  return section as Extract<ResumeSection, { type: T }>;
};

const experience = (id: string, role: string): ExperienceItem => ({
  id: itemId(id),
  role: localeContent(role),
  company: localeContent("示例公司"),
  period: { start: "2024-01" },
  bullets: [localeContent("完成一个重要项目")],
  links: [],
});

const education = (id: string): EducationItem => ({
  id: itemId(id),
  institution: localeContent("示例大学"),
  period: { start: "2018-09", end: "2022-06" },
  details: [],
});

const project = (id: string): ProjectItem => ({
  id: itemId(id),
  name: localeContent("示例项目"),
  bullets: [],
  links: [],
});

describe("applyResumeCommand", () => {
  it("updates profile content immutably and produces a working inverse", () => {
    const document = createDefaultResumeDocument();
    const originalLayout = structuredClone(document.layout);
    const originalTheme = structuredClone(document.theme);
    const applied = applyResumeCommand(document, {
      type: "profile.update",
      payload: { field: "name", value: localeContent("👩‍💻 林默 <设计师>") },
    });

    expect(document.content.profile.name.values["zh-CN"]).toBe("");
    expect(applied.document.content.profile.name.values["zh-CN"]).toBe("👩‍💻 林默 <设计师>");
    expect(applied.document.revision).toBe(document.revision + 1);
    expect(applied.document.layout).toEqual(originalLayout);
    expect(applied.document.theme).toEqual(originalTheme);

    const undone = applyResumeCommand(applied.document, applied.inverseCommand);
    expect(undone.document.content.profile.name.values["zh-CN"]).toBe("");
  });

  it("supports declared content patches, including move, without touching layout", () => {
    const document = createDefaultResumeDocument();
    const contacts: ContactPoint[] = [
      { id: "contact_a", type: "email", value: localeContent("a@example.com"), visible: true },
      { id: "contact_b", type: "phone", value: localeContent("10086"), visible: true },
    ];
    const withContacts = applyResumeCommand(document, {
      type: "profile.update",
      payload: { field: "contacts", value: contacts },
    }).document;
    const paths: ContentPath[] = ["content.profile.contacts"];
    const moved = applyResumeCommand(withContacts, {
      type: "content-patch",
      paths,
      patches: [{ op: "move", from: "content.profile.contacts.0", path: "content.profile.contacts.1" }],
    });
    expect(moved.document.content.profile.contacts.map((contact) => contact.id)).toEqual(["contact_b", "contact_a"]);
    const restored = applyResumeCommand(moved.document, moved.inverseCommand).document;
    expect(restored.content.profile.contacts.map((contact) => contact.id)).toEqual(["contact_a", "contact_b"]);
    expect(() => applyResumeCommand(withContacts, {
      type: "content-patch",
      paths: ["content.profile.name"],
      patches: [{ op: "replace", path: "content.profile.contacts.0", value: contacts[1] }],
    })).toThrowError(ResumeCommandError);
  });

  it("supports experience add, update, remove, and move with correct inverses", () => {
    const document = createDefaultResumeDocument();
    const section = getSection(document, "experience");
    const first = experience("experience_a", "第一份工作");
    const second = experience("experience_b", "第二份工作");

    const addedFirst = applyResumeCommand(document, { type: "experience.add", payload: { sectionId: section.id, item: first } });
    const addedSecond = applyResumeCommand(addedFirst.document, { type: "experience.add", payload: { sectionId: section.id, item: second } });
    expect(getSection(addedSecond.document, "experience").itemOrder).toEqual([first.id, second.id]);

    const updated = applyResumeCommand(addedSecond.document, {
      type: "experience.update",
      payload: { sectionId: section.id, itemId: first.id, changes: { role: localeContent("更新后的职位") } },
    });
    const updatedSection = updated.document.content.sections[section.id];
    if (updatedSection.type !== "experience") throw new Error("Expected experience section.");
    expect(updatedSection.items[first.id].role.values["zh-CN"]).toBe("更新后的职位");
    const restored = applyResumeCommand(updated.document, updated.inverseCommand).document;
    const restoredSection = restored.content.sections[section.id];
    if (restoredSection.type !== "experience") throw new Error("Expected experience section.");
    expect(restoredSection.items[first.id].role.values["zh-CN"]).toBe("第一份工作");

    const moved = applyResumeCommand(addedSecond.document, {
      type: "experience.move",
      payload: { sectionId: section.id, itemId: second.id, toIndex: 0 },
    });
    expect(getSection(moved.document, "experience").itemOrder).toEqual([second.id, first.id]);
    const moveUndone = applyResumeCommand(moved.document, moved.inverseCommand).document;
    expect(getSection(moveUndone, "experience").itemOrder).toEqual([first.id, second.id]);

    const removed = applyResumeCommand(addedSecond.document, {
      type: "experience.remove",
      payload: { sectionId: section.id, itemId: first.id },
    });
    expect(getSection(removed.document, "experience").itemOrder).toEqual([second.id]);
    const removeUndone = applyResumeCommand(removed.document, removed.inverseCommand).document;
    expect(getSection(removeUndone, "experience").itemOrder).toEqual([first.id, second.id]);
  });

  it("supports education and project commands", () => {
    const document = createDefaultResumeDocument();
    const educationSection = getSection(document, "education");
    const projectSection = getSection(document, "projects");
    const educationItem = education("education_a");
    const projectItem = project("project_a");

    const educationAdded = applyResumeCommand(document, { type: "education.add", payload: { sectionId: educationSection.id, item: educationItem } });
    const educationUpdated = applyResumeCommand(educationAdded.document, {
      type: "education.update",
      payload: { sectionId: educationSection.id, itemId: educationItem.id, changes: { degree: localeContent("硕士") } },
    });
    const educationRemoved = applyResumeCommand(educationUpdated.document, {
      type: "education.remove",
      payload: { sectionId: educationSection.id, itemId: educationItem.id },
    });
    expect(getSection(educationRemoved.document, "education").itemOrder).toEqual([]);
    expect(getSection(applyResumeCommand(educationRemoved.document, educationRemoved.inverseCommand).document, "education").itemOrder).toEqual([educationItem.id]);

    const projectAdded = applyResumeCommand(document, { type: "project.add", payload: { sectionId: projectSection.id, item: projectItem } });
    const projectUpdated = applyResumeCommand(projectAdded.document, {
      type: "project.update",
      payload: { sectionId: projectSection.id, itemId: projectItem.id, changes: { description: localeContent("包含特殊字符 <>&") } },
    });
    expect(getSection(projectUpdated.document, "projects").itemOrder).toEqual([projectItem.id]);
    const projectRemoved = applyResumeCommand(projectUpdated.document, {
      type: "project.remove",
      payload: { sectionId: projectSection.id, itemId: projectItem.id },
    });
    expect(getSection(projectRemoved.document, "projects").itemOrder).toEqual([]);
  });

  it("supports skill section add/update/remove and semantic section move", () => {
    const document = createDefaultResumeDocument();
    const skillSection: SkillsSection = {
      id: sectionId("skills_custom"),
      type: "skills",
      title: { defaultLocale: "zh-CN", values: { "zh-CN": "工具" } },
      visible: true,
      itemOrder: [],
      items: {},
    };
    const added = applyResumeCommand(document, { type: "skills-section.add", payload: { section: skillSection, index: 0 } });
    const updated = applyResumeCommand(added.document, {
      type: "skills-section.update",
      payload: { sectionId: skillSection.id, changes: { title: { defaultLocale: "zh-CN", values: { "zh-CN": "工具与技能" } } } },
    });
    expect(updated.document.content.sectionOrder[0]).toBe(skillSection.id);
    const updateUndone = applyResumeCommand(updated.document, updated.inverseCommand).document;
    const undoneSkillSection = updateUndone.content.sections[skillSection.id];
    if (!undoneSkillSection || undoneSkillSection.type !== "skills") throw new Error("Expected skills section.");
    expect(undoneSkillSection.title.values["zh-CN"]).toBe("工具");
    const removed = applyResumeCommand(added.document, { type: "skills-section.remove", payload: { sectionId: skillSection.id } });
    expect(removed.document.content.sections[skillSection.id]).toBeUndefined();
    expect(applyResumeCommand(removed.document, removed.inverseCommand).document.content.sections[skillSection.id]).toBeDefined();

    const originalOrder = document.content.sectionOrder.slice();
    const moved = applyResumeCommand(document, { type: "section.move", payload: { sectionId: originalOrder[originalOrder.length - 1], toIndex: 0 } });
    expect(moved.document.content.sectionOrder[0]).toBe(originalOrder[originalOrder.length - 1]);
    expect(applyResumeCommand(moved.document, moved.inverseCommand).document.content.sectionOrder).toEqual(originalOrder);
  });

  it("rejects invalid commands and removal of content with layout bindings", () => {
    const document = createDefaultResumeDocument();
    const experienceSection = getSection(document, "experience");
    const item = experience("experience_bound", "被绑定经历");
    const added = applyResumeCommand(document, { type: "experience.add", payload: { sectionId: experienceSection.id, item } });
    const page = added.document.layout.pages[added.document.layout.pageOrder[0]];
    const nodeId = "node_item_binding" as LayoutNodeId;
    added.document.layout.nodes[nodeId] = {
      id: nodeId,
      pageId: page.id,
      kind: "section-item",
      binding: { kind: "section-item", sectionId: experienceSection.id, itemId: item.id },
      bounds: { x: 18, y: 200, width: 174, height: 20 },
      rotationDeg: 0,
      zIndex: 1,
      locked: false,
      visible: true,
      style: {},
    };
    page.nodeOrder.push(nodeId);

    expect(() => applyResumeCommand(added.document, {
      type: "experience.remove",
      payload: { sectionId: experienceSection.id, itemId: item.id },
    })).toThrowError(ResumeCommandError);
    expect(() => applyResumeCommand(document, {
      type: "experience.add",
      payload: { sectionId: getSection(document, "education").id, item },
    })).toThrowError(/experience section/);
  });
});
