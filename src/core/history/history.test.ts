import { describe, expect, it } from "vitest";
import { createDefaultResumeDocument } from "../resume/createResumeDocument";
import { createHistoryState, executeCommand, clearHistory, redo, undo } from "./history";

const content = (value: string) => ({
  defaultLocale: "zh-CN",
  values: { "zh-CN": value },
});
const semanticState = (document: ReturnType<typeof createDefaultResumeDocument>) => ({
  content: document.content,
  layout: document.layout,
  theme: document.theme,
});

describe("resume history", () => {
  it("runs A → command B → undo A → redo B using command inverses", () => {
    const initial = createDefaultResumeDocument();
    const history = createHistoryState();
    const command = {
      type: "profile.update" as const,
      payload: { field: "name" as const, value: content("B") },
    };
    const executed = executeCommand(initial, history, command, {
      now: () => "2026-02-01T00:00:00.000Z",
      idFactory: () => "version_test",
    });
    expect(executed.history.past).toHaveLength(1);
    expect(executed.history.future).toHaveLength(0);
    expect(executed.document.content.profile.name.values["zh-CN"]).toBe("B");

    const undone = undo(executed.document, executed.history);
    expect(semanticState(undone.document)).toEqual(semanticState(initial));
    expect(undone.history.past).toHaveLength(0);
    expect(undone.history.future).toHaveLength(1);

    const redone = redo(undone.document, undone.history);
    expect(redone.document.content.profile.name.values["zh-CN"]).toBe("B");
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it("clears redo history after a new command and respects the limit", () => {
    const initial = createDefaultResumeDocument();
    const limited = createHistoryState(2);
    const first = executeCommand(initial, limited, {
      type: "profile.update",
      payload: { field: "headline", value: content("one") },
    });
    const second = executeCommand(first.document, first.history, {
      type: "profile.update",
      payload: { field: "headline", value: content("two") },
    });
    const undone = undo(second.document, second.history);
    const replacement = executeCommand(undone.document, undone.history, {
      type: "profile.update",
      payload: { field: "headline", value: content("replacement") },
    });
    expect(replacement.history.future).toHaveLength(0);
    expect(replacement.history.past.length).toBeLessThanOrEqual(2);
    expect(clearHistory(replacement.history)).toEqual({ past: [], future: [], limit: 2 });
  });

  it("returns unchanged stacks when there is nothing to undo or redo", () => {
    const document = createDefaultResumeDocument();
    const history = createHistoryState();
    const undone = undo(document, history);
    const redone = redo(document, history);
    expect(undone.document).toBe(document);
    expect(redone.document).toBe(document);
    expect(undone.history).not.toBe(history);
    expect(redone.history).not.toBe(history);
  });
});
