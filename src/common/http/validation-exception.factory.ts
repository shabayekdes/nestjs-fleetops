import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ValidationErrorDetailDto } from './error-response.dto.js';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent?: string,
): ValidationErrorDetailDto[] {
  const details: ValidationErrorDetailDto[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      details.push({ field, messages: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }
  return details;
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    message: 'Validation failed',
    details: flattenValidationErrors(errors),
  });
}
