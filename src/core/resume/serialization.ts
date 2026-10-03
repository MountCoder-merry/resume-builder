import type { ResumeDocument } from "../../types/resume";
import {
  validateResumeDocument,
  type ResumeValidationResult,
  type ValidationError,
  type ValidationWarning,
} from "./validateResumeDocument";

export class ResumeSerializationError extends Error {
  readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = "ResumeSerializationError";
    this.errors = errors;
  }
}
export type DeserializeResumeResult =
  | {
      ok: true;
      document: ResumeDocument;
      warnings: ValidationWarning[];
    }
  | {
      ok: false;
      errors: ValidationError[];
      warnings: ValidationWarning[];
    };

export type SerializeResumeOptions = {
  /** JSON indentation. Set to 0 for compact storage. */
  space?: number | string;
};

export function serializeResumeDocument(
  document: ResumeDocument,
  options: SerializeResumeOptions = {},
): string {
  const validation = validateResumeDocument(document);
  if (!validation.valid) {
    throw new ResumeSerializationError(
      "Cannot serialize an invalid ResumeDocument.",
      validation.errors,
    );
  }
  return JSON.stringify(document, null, options.space ?? 2);
}

export function deserializeResumeDocument(json: string): DeserializeResumeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: "JSON_INVALID",
          path: "$",
          message: error instanceof Error ? error.message : "Invalid JSON.",
        },
      ],
      warnings: [],
    };
  }

  const validation: ResumeValidationResult = validateResumeDocument(parsed);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }
  return {
    ok: true,
    document: parsed as ResumeDocument,
    warnings: validation.warnings,
  };
}
