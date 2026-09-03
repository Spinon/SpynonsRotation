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

export class EnhancementSingleTargetError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnhancementSingleTargetError";
    this.code = code;
    this.details = details;
  }
}

export class EnhancementMultiTargetError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnhancementMultiTargetError";
    this.code = code;
    this.details = details;
  }
}
