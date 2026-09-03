export class RegressionError extends Error {
  constructor(code, message, { source, issues, details, cause } = {}) {
    super(message, { cause });
    this.name = "RegressionError";
    this.code = code;
    this.source = source;
    this.issues = issues;
    this.details = details;
  }
}
