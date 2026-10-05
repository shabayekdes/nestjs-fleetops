import type { ValidationError } from 'class-validator';
import {
  flattenValidationErrors,
  validationExceptionFactory,
} from './validation-exception.factory.js';

describe('flattenValidationErrors', () => {
  it('flattens nested errors into dotted paths', () => {
    const errors: ValidationError[] = [
      { property: 'email', constraints: { isEmail: 'email must be an email' } },
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'name',
                constraints: { isString: 'name must be a string' },
              },
            ],
          },
        ],
      },
    ];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'email', messages: ['email must be an email'] },
      { field: 'items.0.name', messages: ['name must be a string'] },
    ]);
  });
});

describe('validationExceptionFactory', () => {
  it('reports every constraint of a field', () => {
    const errors: ValidationError[] = [
      {
        property: 'password',
        constraints: {
          minLength: 'too short',
          isString: 'must be a string',
        },
      },
    ];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'password', messages: ['too short', 'must be a string'] },
    ]);
  });

  it('names a non-whitelisted property', () => {
    const errors: ValidationError[] = [
      {
        property: 'role',
        constraints: { whitelistValidation: 'property role should not exist' },
      },
    ];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'role', messages: ['property role should not exist'] },
    ]);
  });

  it('builds a 400 with message "Validation failed" and details', () => {
    const exception = validationExceptionFactory([
      { property: 'email', constraints: { isEmail: 'bad email' } },
    ]);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      message: 'Validation failed',
      details: [{ field: 'email', messages: ['bad email'] }],
    });
  });
});
