export class OptimizerError extends Error {
  constructor(code, message, { source = "<memory>", issues = [], details = {}, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OptimizerError";
    this.code = code;
    this.source = source;
    this.issues = issues;
    this.details = details;
  }
}
