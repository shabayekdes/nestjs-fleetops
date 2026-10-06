// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice, type NoticeVariant } from './notice';

describe('Notice', () => {
  it.each<[NoticeVariant, string]>([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'alert'],
    ['error', 'alert'],
  ])('%s uses role %s', (variant, role) => {
    render(<Notice variant={variant}>Hello</Notice>);
    expect(screen.getByRole(role)).toHaveTextContent('Hello');
  });
});
