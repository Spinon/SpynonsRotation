export class EnhancementCatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnhancementCatalogError";
    this.code = code;
    this.details = details;
  }
}
