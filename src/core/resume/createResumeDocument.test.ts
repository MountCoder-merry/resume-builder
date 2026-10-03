import { describe, expect, it } from "vitest";
import {
  cloneResumeDocument,
  createDefaultResumeDocument,
  createEmptyResumeDocument,
} from "./createResumeDocument";
import { validateResumeDocument } from "./validateResumeDocument";

describe("ResumeDocument factory", () => {
  it("creates a valid empty document with one A4 page", () => {
    const document = createEmptyResumeDocument();
    const validation = validateResumeDocument(document);

    expect(validation.valid).toBe(true);
    expect(document.defaultLocale).toBe("zh-CN");
    expect(document.layout.pageOrder).toHaveLength(1);
    const page = document.layout.pages[document.layout.pageOrder[0]];
    expect(page.size.preset).toBe("A4");
    expect(page.size.orientation).toBe("portrait");
  });

  it("supports a requested locale and creates unique IDs", () => {
    const first = createDefaultResumeDocument({ locale: "en-US" });
    const second = createDefaultResumeDocument({ locale: "en-US" });
    const firstSectionIds = Object.keys(first.content.sections);

    expect(first.defaultLocale).toBe("en-US");
    expect(first.supportedLocales).toEqual(["en-US"]);
    expect(first.documentId).not.toBe(second.documentId);
    expect(new Set(firstSectionIds).size).toBe(firstSectionIds.length);
    expect(new Set(first.layout.pageOrder).size).toBe(first.layout.pageOrder.length);
    expect(new Set(Object.keys(first.layout.nodes)).size).toBe(Object.keys(first.layout.nodes).length);
  });

  it("does not share mutable references between documents or clones", () => {
    const original = createDefaultResumeDocument();
    const clone = cloneResumeDocument(original, {
      now: () => "2026-02-01T00:00:00.000Z",
      idFactory: () => "document_clone",
    });

    expect(clone).not.toBe(original);
    expect(clone.documentId).not.toBe(original.documentId);
    expect(clone.metadata.variantOf).toBe(original.documentId);
    clone.content.profile.name.values["zh-CN"] = "修改后的名字";
    clone.layout.pages[clone.layout.pageOrder[0]].margins.left = 22;
    expect(original.content.profile.name.values["zh-CN"]).toBe("");
    expect(original.layout.pages[original.layout.pageOrder[0]].margins.left).toBe(18);
  });

  it("rejects factory options that would create invalid identity metadata", () => {
    expect(() => createEmptyResumeDocument({ locale: "" })).toThrowError(RangeError);
    expect(() => createEmptyResumeDocument({ now: () => "not-a-date" })).toThrowError(RangeError);
    expect(() => createDefaultResumeDocument({ idFactory: () => "same-id" })).toThrowError(RangeError);
  });
});
