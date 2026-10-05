import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CostSummaryQueryDto } from './cost-summary-query.dto.js';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CostSummaryQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('CostSummaryQueryDto', () => {
  it('accepts an empty query', async () => {
    expect((await run({})).errors).toHaveLength(0);
  });

  it.each(['from', 'to'])('accepts valid %s months', async (field) => {
    for (const v of ['1900-01', '2026-12', '2026-01', '2999-12']) {
      expect((await run({ [field]: v })).errors).toHaveLength(0);
    }
  });

  it.each(['from', 'to'])('rejects bad %s months', async (field) => {
    for (const v of [
      '2026-13',
      '2026-00',
      '2026-1',
      '1899-12',
      '3000-01',
      '9999-12',
      '0001-01',
      '2026-01-01',
      '202601',
      '',
      'x',
    ]) {
      expect((await run({ [field]: v })).fields).toContain(field);
    }
  });

  it('uses the documented message', async () => {
    const { errors } = await run({ from: '2026-13' });
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      'from must be in YYYY-MM format',
    );
  });

  it('rejects unknown keys', async () => {
    expect((await run({ page: '1' })).fields).toContain('page');
  });
});
