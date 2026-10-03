import type {
  ContentPath,
  ContentBlockId,
  JsonPatchOperation,
  ResumeCommand,
  ResumeDocument,
} from "../../../types/resume";
import { bumpRevision, cloneDocument, assertItemIdAvailable, assertSectionIdAvailable, educationSectionAt, experienceSectionAt, hasItemLayoutBinding, hasLayoutBinding, moveId, projectSectionAt, skillsSectionAt, assertValidIndex } from "./helpers";
import { commandError } from "./errors";
import { validateResumeDocument } from "../validateResumeDocument";

export type AppliedResumeCommand = {
  document: ResumeDocument;
  inverseCommand: ResumeCommand;
};

type ProfileUpdateCommand = Extract<ResumeCommand, { type: "profile.update" }>;
type ExperienceCommand = Extract<ResumeCommand, { type: "experience.add" | "experience.update" | "experience.remove" | "experience.move" }>;
type EducationCommand = Extract<ResumeCommand, { type: "education.add" | "education.update" | "education.remove" }>;
type ProjectCommand = Extract<ResumeCommand, { type: "project.add" | "project.update" | "project.remove" }>;
type SkillsSectionCommand = Extract<ResumeCommand, { type: "skills-section.add" | "skills-section.update" | "skills-section.remove" }>;

const captureChanges = <T extends object>(target: T, changes: Partial<T>): Partial<T> => {
  const previous: Partial<T> = {};
  for (const key of Object.keys(changes) as Array<keyof T>) {
    previous[key] = structuredClone(target[key]);
  }
  return previous;
};

const applyChanges = <T extends object>(target: T, changes: Partial<T>): void => {
  for (const key of Object.keys(changes) as Array<keyof T>) {
    const value = changes[key];
    if (value === undefined) {
      Reflect.deleteProperty(target, key);
    } else {
      Reflect.set(target, key, structuredClone(value));
    }
  }
};

const assertAllowedChangeKeys = (
  changes: unknown,
  allowed: readonly string[],
  path: string,
): void => {
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) {
    commandError("CHANGES_INVALID", "Command changes must be an object.", path);
  }
  for (const key of Object.keys(changes as object)) {
    if (!allowed.includes(key)) commandError("FIELD_NOT_ALLOWED", `Field ${key} cannot be changed by this command.`, `${path}.${key}`);
  }
};

const contentPathSegments = (path: string): string[] => {
  const segments = path.split(".");
  if (segments[0] !== "content" || segments.length < 2 || segments.some((segment) => segment.length === 0)) commandError("CONTENT_PATH_INVALID", "Content patches must start with a non-empty content path.", path);
  if (segments.some((segment) => ["__proto__", "constructor", "prototype"].includes(segment))) commandError("CONTENT_PATH_UNSAFE", "Content patch contains an unsafe path segment.", path);
  return segments;
};

const readPath = (root: unknown, segments: string[]): unknown => {
  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
};

const writePath = (root: unknown, segments: string[], operation: "add" | "replace" | "remove", value?: unknown): void => {
  if (segments.length < 2) commandError("CONTENT_PATH_INVALID", "A patch must target a content field.");
  let parent: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= parent.length) commandError("CONTENT_PATH_NOT_FOUND", `Path segment ${segment} was not found.`);
      parent = parent[index];
    } else if (typeof parent === "object" && parent !== null) {
      const next = (parent as Record<string, unknown>)[segment];
      if (next === undefined) commandError("CONTENT_PATH_NOT_FOUND", `Path segment ${segment} was not found.`);
      parent = next;
    } else {
      commandError("CONTENT_PATH_NOT_FOUND", "Patch path does not resolve to an object.");
    }
  }
  const leaf = segments[segments.length - 1];
  if (Array.isArray(parent)) {
    const index = leaf === "-" ? parent.length : Number(leaf);
    if (!Number.isInteger(index) || index < 0 || index > parent.length || (operation !== "add" && index >= parent.length)) commandError("CONTENT_PATH_INVALID", `Array index ${leaf} is invalid.`);
    if (operation === "add") parent.splice(index, 0, value);
    else if (operation === "replace") parent[index] = value;
    else parent.splice(index, 1);
    return;
  }
  if (typeof parent !== "object" || parent === null) commandError("CONTENT_PATH_NOT_FOUND", "Patch parent is not an object.");
  const record = parent as Record<string, unknown>;
  if (operation === "remove") delete record[leaf];
  else record[leaf] = value;
};

const isDeclaredContentPath = (path: string, paths: ContentPath[]): boolean =>
  paths.some((basePath) => path === basePath || path.startsWith(`${basePath}.`));

const assertLayoutReferencesResolve = (document: ResumeDocument): void => {
  for (const node of Object.values(document.layout.nodes)) {
    if (node.kind === "image") {
      if (!document.content.assets[node.assetId]) commandError("LAYOUT_DEPENDENCY", "Content patch would leave an image node bound to a missing asset.");
      continue;
    }
    if (node.kind === "section" || node.kind === "section-item") {
      const section = document.content.sections[node.binding.sectionId];
      if (!section) commandError("LAYOUT_DEPENDENCY", "Content patch would leave a layout node bound to a missing section.");
      if (node.kind === "section-item" && (section.type === "custom" || !section.items[node.binding.itemId])) commandError("LAYOUT_DEPENDENCY", "Content patch would leave a layout node bound to a missing item.");
    } else if (node.kind === "text") {
      if (!("blockId" in node.binding)) continue;
      const blockId = (node.binding as { kind: "content-block"; blockId: ContentBlockId }).blockId;
      const blockExists = Object.values(document.content.sections).some((section) => section.type === "custom" && Boolean(section.blocks[blockId]));
      if (!blockExists) commandError("LAYOUT_DEPENDENCY", "Content patch would leave a text node bound to a missing content block.");
    }
  }
  for (const page of Object.values(document.layout.pages)) {
    if (page.background.assetId && !document.content.assets[page.background.assetId]) commandError("LAYOUT_DEPENDENCY", "Content patch would leave a page background bound to a missing asset.");
  }
};

const applyContentPatch = (document: ResumeDocument, patches: JsonPatchOperation[], paths: ContentPath[]): ResumeCommand => {
  const inverse: JsonPatchOperation[] = [];
  for (const patch of patches) {
    const segments = contentPathSegments(patch.path);
    if (!isDeclaredContentPath(patch.path, paths)) commandError("CONTENT_PATH_NOT_DECLARED", "Patch path is not included in command.paths.", patch.path);
    if (patch.op === "move") {
      const fromSegments = contentPathSegments(patch.from);
      if (!isDeclaredContentPath(patch.from, paths)) commandError("CONTENT_PATH_NOT_DECLARED", "Move source is not included in command.paths.", patch.from);
      const before = structuredClone(readPath(document, fromSegments));
      if (before === undefined) commandError("CONTENT_PATH_NOT_FOUND", "Move source does not exist.", patch.from);
      writePath(document, fromSegments, "remove");
      writePath(document, segments, "add", structuredClone(before));
      inverse.unshift({ op: "move", from: patch.path, path: patch.from });
    } else if (patch.op === "add") {
      const before = structuredClone(readPath(document, segments));
      const parentBefore = readPath(document, segments.slice(0, -1));
      writePath(document, segments, "add", structuredClone(patch.value));
      inverse.unshift(Array.isArray(parentBefore) || before === undefined ? { op: "remove", path: patch.path } : { op: "replace", path: patch.path, value: before });
    } else if (patch.op === "replace") {
      const before = structuredClone(readPath(document, segments));
      if (before === undefined) commandError("CONTENT_PATH_NOT_FOUND", "Replace target does not exist.", patch.path);
      writePath(document, segments, "replace", structuredClone(patch.value));
      inverse.unshift({ op: "replace", path: patch.path, value: before });
    } else {
      const before = structuredClone(readPath(document, segments));
      if (before === undefined) commandError("CONTENT_PATH_NOT_FOUND", "Remove target does not exist.", patch.path);
      writePath(document, segments, "remove");
      inverse.unshift({ op: "add", path: patch.path, value: before });
    }
  }
  assertLayoutReferencesResolve(document);
  return { type: "content-patch", patches: inverse, paths: paths.slice() };
};

const applyProfileUpdate = (document: ResumeDocument, command: ProfileUpdateCommand): ResumeCommand => {
  const profile = document.content.profile;
  const payload = command.payload;
  if (payload.field === "contacts") {
    const previous = structuredClone(profile.contacts);
    profile.contacts = structuredClone(payload.value);
    return { type: "profile.update", payload: { field: "contacts", value: previous } };
  }
  if (payload.field === "links") {
    const previous = structuredClone(profile.links);
    profile.links = structuredClone(payload.value);
    return { type: "profile.update", payload: { field: "links", value: previous } };
  }
  if (payload.field === "name") {
    const value = payload.value;
    if (value === undefined) commandError("PROFILE_NAME_REQUIRED", "Profile name cannot be removed.");
    const previous = structuredClone(profile.name);
    profile.name = structuredClone(value as NonNullable<typeof value>);
    return { type: "profile.update", payload: { field: "name", value: previous } };
  }
  if (payload.field === "headline") {
    const previous = structuredClone(profile.headline);
    if (payload.value === undefined) delete profile.headline;
    else profile.headline = structuredClone(payload.value);
    return { type: "profile.update", payload: { field: "headline", value: previous } };
  }
  const previous = structuredClone(profile.summary);
  if (payload.value === undefined) delete profile.summary;
  else profile.summary = structuredClone(payload.value);
  return { type: "profile.update", payload: { field: "summary", value: previous } };
};

const applyExperience = (document: ResumeDocument, command: ExperienceCommand): ResumeCommand => {
  if (command.type === "experience.add") {
    const section = experienceSectionAt(document, command.payload.sectionId);
    assertItemIdAvailable(document, command.payload.item.id);
    const index = assertValidIndex(command.payload.index, section.itemOrder.length, "payload.index");
    section.items[command.payload.item.id] = structuredClone(command.payload.item);
    section.itemOrder.splice(index, 0, command.payload.item.id);
    return { type: "experience.remove", payload: { sectionId: command.payload.sectionId, itemId: command.payload.item.id } };
  }
  if (command.type === "experience.update") {
    const section = experienceSectionAt(document, command.payload.sectionId);
    assertAllowedChangeKeys(command.payload.changes, ["role", "company", "location", "period", "bullets", "links"], "payload.changes");
    const item = section.items[command.payload.itemId];
    if (!item) commandError("ITEM_NOT_FOUND", "Experience item was not found.");
    const previous = captureChanges(item, command.payload.changes);
    applyChanges(item, command.payload.changes);
    return { type: "experience.update", payload: { ...command.payload, changes: previous } };
  }
  if (command.type === "experience.remove") {
    const section = experienceSectionAt(document, command.payload.sectionId);
    const item = section.items[command.payload.itemId];
    if (!item) commandError("ITEM_NOT_FOUND", "Experience item was not found.");
    if (hasItemLayoutBinding(document, command.payload.sectionId, command.payload.itemId)) commandError("LAYOUT_DEPENDENCY", "Remove layout bindings before removing this experience item.");
    const index = section.itemOrder.indexOf(command.payload.itemId);
    if (index < 0) commandError("ORDER_INVALID", "Experience item is not present in itemOrder.");
    delete section.items[command.payload.itemId];
    section.itemOrder.splice(index, 1);
    return { type: "experience.add", payload: { sectionId: command.payload.sectionId, item: structuredClone(item), index } };
  }
  const section = experienceSectionAt(document, command.payload.sectionId);
  const fromIndex = moveId(section.itemOrder, command.payload.itemId, command.payload.toIndex, "payload.toIndex");
  return { type: "experience.move", payload: { ...command.payload, toIndex: fromIndex } };
};

const applyEducation = (document: ResumeDocument, command: EducationCommand): ResumeCommand => {
  if (command.type === "education.add") {
    const section = educationSectionAt(document, command.payload.sectionId);
    assertItemIdAvailable(document, command.payload.item.id);
    const index = assertValidIndex(command.payload.index, section.itemOrder.length, "payload.index");
    section.items[command.payload.item.id] = structuredClone(command.payload.item);
    section.itemOrder.splice(index, 0, command.payload.item.id);
    return { type: "education.remove", payload: { sectionId: command.payload.sectionId, itemId: command.payload.item.id } };
  }
  if (command.type === "education.update") {
    const section = educationSectionAt(document, command.payload.sectionId);
    assertAllowedChangeKeys(command.payload.changes, ["institution", "degree", "fieldOfStudy", "location", "period", "details"], "payload.changes");
    const item = section.items[command.payload.itemId];
    if (!item) commandError("ITEM_NOT_FOUND", "Education item was not found.");
    const previous = captureChanges(item, command.payload.changes);
    applyChanges(item, command.payload.changes);
    return { type: "education.update", payload: { ...command.payload, changes: previous } };
  }
  const section = educationSectionAt(document, command.payload.sectionId);
  const item = section.items[command.payload.itemId];
  if (!item) commandError("ITEM_NOT_FOUND", "Education item was not found.");
  if (hasItemLayoutBinding(document, command.payload.sectionId, command.payload.itemId)) commandError("LAYOUT_DEPENDENCY", "Remove layout bindings before removing this education item.");
  const index = section.itemOrder.indexOf(command.payload.itemId);
  if (index < 0) commandError("ORDER_INVALID", "Education item is not present in itemOrder.");
  delete section.items[command.payload.itemId];
  section.itemOrder.splice(index, 1);
  return { type: "education.add", payload: { sectionId: command.payload.sectionId, item: structuredClone(item), index } };
};

const applyProject = (document: ResumeDocument, command: ProjectCommand): ResumeCommand => {
  if (command.type === "project.add") {
    const section = projectSectionAt(document, command.payload.sectionId);
    assertItemIdAvailable(document, command.payload.item.id);
    const index = assertValidIndex(command.payload.index, section.itemOrder.length, "payload.index");
    section.items[command.payload.item.id] = structuredClone(command.payload.item);
    section.itemOrder.splice(index, 0, command.payload.item.id);
    return { type: "project.remove", payload: { sectionId: command.payload.sectionId, itemId: command.payload.item.id } };
  }
  if (command.type === "project.update") {
    const section = projectSectionAt(document, command.payload.sectionId);
    assertAllowedChangeKeys(command.payload.changes, ["name", "role", "description", "period", "bullets", "links"], "payload.changes");
    const item = section.items[command.payload.itemId];
    if (!item) commandError("ITEM_NOT_FOUND", "Project item was not found.");
    const previous = captureChanges(item, command.payload.changes);
    applyChanges(item, command.payload.changes);
    return { type: "project.update", payload: { ...command.payload, changes: previous } };
  }
  const section = projectSectionAt(document, command.payload.sectionId);
  const item = section.items[command.payload.itemId];
  if (!item) commandError("ITEM_NOT_FOUND", "Project item was not found.");
  if (hasItemLayoutBinding(document, command.payload.sectionId, command.payload.itemId)) commandError("LAYOUT_DEPENDENCY", "Remove layout bindings before removing this project item.");
  const index = section.itemOrder.indexOf(command.payload.itemId);
  if (index < 0) commandError("ORDER_INVALID", "Project item is not present in itemOrder.");
  delete section.items[command.payload.itemId];
  section.itemOrder.splice(index, 1);
  return { type: "project.add", payload: { sectionId: command.payload.sectionId, item: structuredClone(item), index } };
};

const applySkillSection = (document: ResumeDocument, command: SkillsSectionCommand): ResumeCommand => {
  if (command.type === "skills-section.add") {
    const section = command.payload.section;
    assertSectionIdAvailable(document, section.id);
    for (const item of Object.values(section.items)) assertItemIdAvailable(document, item.id);
    const index = assertValidIndex(command.payload.index, document.content.sectionOrder.length, "payload.index");
    document.content.sections[section.id] = structuredClone(section);
    document.content.sectionOrder.splice(index, 0, section.id);
    return { type: "skills-section.remove", payload: { sectionId: section.id } };
  }
  if (command.type === "skills-section.update") {
    const section = skillsSectionAt(document, command.payload.sectionId);
    assertAllowedChangeKeys(command.payload.changes, ["title", "visible", "itemOrder", "items"], "payload.changes");
    const previous = captureChanges(section, command.payload.changes);
    applyChanges(section, command.payload.changes);
    return { type: "skills-section.update", payload: { sectionId: command.payload.sectionId, changes: previous } };
  }
  const section = skillsSectionAt(document, command.payload.sectionId);
  if (hasLayoutBinding(document, section.id)) commandError("LAYOUT_DEPENDENCY", "Remove layout bindings before removing this skills section.", `content.sections.${section.id}`);
  const index = document.content.sectionOrder.indexOf(section.id);
  if (index < 0) commandError("ORDER_INVALID", "Skills section is not present in sectionOrder.");
  delete document.content.sections[section.id];
  document.content.sectionOrder.splice(index, 1);
  return { type: "skills-section.add", payload: { section: structuredClone(section), index } };
};

const applyMoveSection = (document: ResumeDocument, command: Extract<ResumeCommand, { type: "section.move" }>): ResumeCommand => {
  const fromIndex = moveId(document.content.sectionOrder, command.payload.sectionId, command.payload.toIndex, "payload.toIndex");
  return { type: "section.move", payload: { ...command.payload, toIndex: fromIndex } };
};

export function applyResumeCommand(document: ResumeDocument, command: ResumeCommand): AppliedResumeCommand {
  const next = cloneDocument(document);
  let inverseCommand: ResumeCommand | undefined;
  switch (command.type) {
    case "profile.update":
      inverseCommand = applyProfileUpdate(next, command);
      break;
    case "experience.add":
    case "experience.update":
    case "experience.remove":
    case "experience.move":
      inverseCommand = applyExperience(next, command);
      break;
    case "education.add":
    case "education.update":
    case "education.remove":
      inverseCommand = applyEducation(next, command);
      break;
    case "project.add":
    case "project.update":
    case "project.remove":
      inverseCommand = applyProject(next, command);
      break;
    case "skills-section.add":
    case "skills-section.update":
    case "skills-section.remove":
      inverseCommand = applySkillSection(next, command);
      break;
    case "section.move":
      inverseCommand = applyMoveSection(next, command);
      break;
    case "content-patch":
      inverseCommand = applyContentPatch(next, command.patches, command.paths);
      break;
    case "layout-patch":
    case "theme-patch":
  case "page-patch":
      commandError("COMMAND_NOT_IMPLEMENTED", `${command.type} is reserved for the layout/theme core and is not implemented in this content command handler.`);
  }
  const inverse = inverseCommand;
  if (!inverse) commandError("COMMAND_NOT_IMPLEMENTED", `Command ${command.type} did not produce an inverse command.`);
  const validation = validateResumeDocument(next);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    commandError("DOCUMENT_INVALID_AFTER_COMMAND", firstError?.message ?? "Command would create an invalid document.", firstError?.path);
  }
  bumpRevision(next);
  return { document: next, inverseCommand: inverse as ResumeCommand };
}
