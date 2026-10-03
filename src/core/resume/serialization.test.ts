import { describe, expect, it } from "vitest";
import type { PageId } from "../../types/resume";
import { exampleResume } from "../../data/exampleResume";
import { createEmptyResumeDocument } from "./createResumeDocument";
import {
  deserializeResumeDocument,
  ResumeSerializationError,
  serializeResumeDocument,
} from "./serialization";
import { validateResumeDocument } from "./validateResumeDocument";

describe("ResumeDocument serialization", () => {
  it("round-trips the structured example resume with Chinese, English, emoji, and special characters", () => {
    expect(validateResumeDocument(exampleResume).valid).toBe(true);
    const json = serializeResumeDocument(exampleResume);
    const result = deserializeResumeDocument(json);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a successful deserialization.");
    expect(result.document).toEqual(exampleResume);
    expect(result.document.content.profile.name.values["en-US"]).toBe("Mo Lin");
    expect(result.document.content.profile.headline?.values["zh-CN"]).toContain("·");
  });

  it("preserves an empty section and a second page", () => {
    const document = createEmptyResumeDocument({ locale: "zh-CN" });
    document.content.profile.name.values["zh-CN"] = "张三 😀 <测试> & 特殊字符";
    const secondPageId = "page_two" as PageId;
    document.layout.pages[secondPageId] = {
      id: secondPageId,
      size: { preset: "A4", orientation: "portrait", widthMm: 210, heightMm: 297 },
      margins: { top: 18, right: 18, bottom: 18, left: 18 },
      background: { colorToken: "background" },
      nodeOrder: [],
      allowOverflow: false,
    };
    document.layout.pageOrder.push(secondPageId);

    const result = deserializeResumeDocument(serializeResumeDocument(document, { space: 0 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a successful deserialization.");
    expect(result.document.content.profile.name.values["zh-CN"]).toContain("😀");
    expect(result.document.layout.pageOrder).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.code === "NO_SECTIONS")).toBe(true);
  });

  it("rejects invalid JSON, unsupported schema, and invalid documents", () => {
    const malformed = deserializeResumeDocument("{not-json");
    expect(malformed.ok).toBe(false);
    if (malformed.ok) throw new Error("Expected malformed JSON to fail.");
    expect(malformed.errors[0].code).toBe("JSON_INVALID");

    const document = createEmptyResumeDocument();
    document.schemaVersion = 999;
    const schemaResult = deserializeResumeDocument(JSON.stringify(document));
    expect(schemaResult.ok).toBe(false);
    if (!schemaResult.ok) expect(schemaResult.errors.some((error) => error.code === "SCHEMA_VERSION_UNSUPPORTED")).toBe(true);

    expect(() => serializeResumeDocument(document)).toThrowError(ResumeSerializationError);
  });
});
