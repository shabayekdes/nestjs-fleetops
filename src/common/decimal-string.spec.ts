import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsDecimalString } from './decimal-string.js';

class Money {
  @IsDecimalString({ integerDigits: 10, fractionDigits: 2, allowZero: true })
  value: unknown;
}
class Positive {
  @IsDecimalString({ integerDigits: 5, fractionDigits: 3, allowZero: false })
  value: unknown;
}

const run = async <T extends object>(cls: new () => T, value: unknown) =>
  validate(plainToInstance(cls, { value }));

describe('IsDecimalString', () => {
  describe('money (10,2, zero allowed)', () => {
    it.each(['0', '0.00', '123.45', '9999999999.99', '5', '0.5', '007.10'])(
      'accepts %j',
      async (v) => {
        expect(await run(Money, v)).toHaveLength(0);
      },
    );

    it.each([
      '12.345',
      '10000000000',
      '-1',
      '+1',
      '1e3',
      ' 1',
      '1 ',
      '1.',
      '.5',
      '',
      '1,5',
      'abc',
      12.5,
      0,
      null,
      undefined,
      [],
      {},
      true,
    ])('rejects %j', async (v) => {
      expect(await run(Money, v)).toHaveLength(1);
    });

    it('reports the documented message', async () => {
      const [error] = await run(Money, 12.5);
      expect(Object.values(error.constraints ?? {})[0]).toBe(
        'value must be a decimal string with at most 10 integer digits and 2 decimal places, e.g. "123.45"',
      );
    });
  });

  describe('positive (5,3)', () => {
    it.each(['0', '0.0', '0.000', '00.000'])('rejects zero %j', async (v) => {
      expect(await run(Positive, v)).toHaveLength(1);
    });

    it.each(['0.001', '1', '45.5', '99999.999'])('accepts %j', async (v) => {
      expect(await run(Positive, v)).toHaveLength(0);
    });

    it.each(['100000', '1.0001'])('rejects %j', async (v) => {
      expect(await run(Positive, v)).toHaveLength(1);
    });

    it('uses the positive message', async () => {
      const [error] = await run(Positive, '0');
      expect(Object.values(error.constraints ?? {})[0]).toBe(
        'value must be a positive decimal string with at most 5 integer digits and 3 decimal places, e.g. "123.45"',
      );
    });
  });
});
