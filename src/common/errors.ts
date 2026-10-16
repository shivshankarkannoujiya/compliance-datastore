/**
 * Application errors thrown by the storage modules. They carry no HTTP semantics; the API layer maps them
 * (NotFound → 404, Conflict → 409, Validation → 400, Forbidden → 403).
 */
export abstract class ComplianceError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ComplianceError {
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends ComplianceError {
  readonly code = 'CONFLICT';
}

export class ValidationError extends ComplianceError {
  readonly code = 'VALIDATION';
}

export class ForbiddenError extends ComplianceError {
  readonly code = 'FORBIDDEN';
}
