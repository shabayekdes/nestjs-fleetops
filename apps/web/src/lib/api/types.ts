import type { components } from './generated/openapi';

export type Schemas = components['schemas'];
export type ApiErrorBody = Schemas['ErrorResponseDto'];
export type HealthResponse = Schemas['HealthResponseDto'];
