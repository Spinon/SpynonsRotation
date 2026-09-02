export class CompilerError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = "CompilerError";
    this.code = code;
    this.details = details;
  }
}

export function compilerError(code, message, context = {}, cause) {
  return new CompilerError(code, message, context, cause === undefined ? {} : { cause });
}
