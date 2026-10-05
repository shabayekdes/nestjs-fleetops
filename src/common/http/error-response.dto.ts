export class ValidationErrorDetailDto {
  /** Dotted path of the invalid field, for example `items.0.name`. */
  field: string;

  /** Validation messages for the field. */
  messages: string[];
}

export class ErrorResponseDto {
  /** HTTP status code. */
  statusCode: number;

  /** HTTP reason phrase, for example `Not Found`. */
  error: string;

  /** Human readable summary. */
  message: string;

  /** Equals the X-Request-Id response header. */
  requestId: string;

  /** ISO 8601 time the error was produced. */
  timestamp: string;

  /** Request path without the query string. */
  path: string;

  /** Per-field problems. Only present on validation errors. */
  details?: ValidationErrorDetailDto[];
}
