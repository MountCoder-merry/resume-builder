export class ResumeCommandError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = "ResumeCommandError";
    this.code = code;
    this.path = path;
  }
}

export const commandError = (code: string, message: string, path?: string): never => {
  throw new ResumeCommandError(code, message, path);
};
