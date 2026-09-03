export class EnhancementCatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnhancementCatalogError";
    this.code = code;
    this.details = details;
  }
}

export class EnhancementBaselineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnhancementBaselineError";
    this.code = code;
    this.details = details;
  }
}
