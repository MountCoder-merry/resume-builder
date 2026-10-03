import type {
  HistoryEntry,
  HistoryState,
  ResumeCommand,
  ResumeDocument,
  VersionId,
} from "../../types/resume";
import { createEntityId } from "../resume/createResumeDocument";
import { applyResumeCommand } from "../resume/commands/applyResumeCommand";

export type HistoryOptions = {
  now?: () => string;
  idFactory?: (prefix: string) => string;
  label?: string;
};

export type HistoryExecutionResult = {
  document: ResumeDocument;
  history: HistoryState;
  entry: HistoryEntry;
};

export type HistoryTransitionResult = {
  document: ResumeDocument;
  history: HistoryState;
  entry?: HistoryEntry;
};

const defaultNow = (): string => new Date().toISOString();

const clone = <T>(value: T): T => structuredClone(value);

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("History limit must be a positive integer.");
  return limit;
};

const trimPast = (past: HistoryEntry[], limit: number): HistoryEntry[] =>
  past.length > limit ? past.slice(past.length - limit) : past;

const createHistoryEntry = (
  document: ResumeDocument,
  command: ResumeCommand,
  next: ReturnType<typeof applyResumeCommand>,
  options: HistoryOptions,
): HistoryEntry => {
  const now = options.now ?? defaultNow;
  const idFactory = options.idFactory ?? createEntityId;
  return {
    id: idFactory("version") as VersionId,
    revisionBefore: document.revision,
    revisionAfter: next.document.revision,
    command: clone(command),
    inverseCommand: clone(next.inverseCommand),
    createdAt: now(),
    ...(options.label ? { label: options.label } : {}),
  };
};

export function createHistoryState(limit = 100): HistoryState {
  return { past: [], future: [], limit: normalizeLimit(limit) };
}

/**
 * Execute a command and record its inverse. A new command always invalidates
 * the redo stack, matching the conventional editor history model.
 */
export function executeCommand(
  document: ResumeDocument,
  history: HistoryState,
  command: ResumeCommand,
  options: HistoryOptions = {},
): HistoryExecutionResult {
  const limit = normalizeLimit(history.limit);
  const applied = applyResumeCommand(document, command);
  const entry = createHistoryEntry(document, command, applied, options);
  const past = trimPast([...history.past, entry], limit);
  return {
    document: applied.document,
    history: { past, future: [], limit },
    entry,
  };
}

/** Undo the most recent command without creating a second history entry. */
export function undo(document: ResumeDocument, history: HistoryState): HistoryTransitionResult {
  if (history.past.length === 0) return { document, history: { ...history, past: [...history.past], future: [...history.future] } };
  const entry = history.past[history.past.length - 1];
  const applied = applyResumeCommand(document, entry.inverseCommand);
  return {
    document: applied.document,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, clone(entry)],
      limit: history.limit,
    },
    entry: clone(entry),
  };
}

/** Redo the next command without adding a duplicate history entry. */
export function redo(document: ResumeDocument, history: HistoryState): HistoryTransitionResult {
  if (history.future.length === 0) return { document, history: { ...history, past: [...history.past], future: [...history.future] } };
  const entry = history.future[history.future.length - 1];
  const applied = applyResumeCommand(document, entry.command);
  const past = trimPast([...history.past, clone(entry)], history.limit);
  return {
    document: applied.document,
    history: {
      past,
      future: history.future.slice(0, -1),
      limit: history.limit,
    },
    entry: clone(entry),
  };
}

export function clearHistory(history: HistoryState): HistoryState {
  return { past: [], future: [], limit: normalizeLimit(history.limit) };
}

export const canUndo = (history: HistoryState): boolean => history.past.length > 0;
export const canRedo = (history: HistoryState): boolean => history.future.length > 0;
