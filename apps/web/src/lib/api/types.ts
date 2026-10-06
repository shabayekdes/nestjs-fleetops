import type { components } from './generated/openapi';

export type Schemas = components['schemas'];
export type ApiErrorBody = Schemas['ErrorResponseDto'];
export type HealthResponse = Schemas['HealthResponseDto'];
export type LoginRequest = Schemas['LoginDto'];
export type LoginResponse = Schemas['LoginResponseDto'];
export type CurrentUser = Schemas['MeResponseDto'];
export type Role = CurrentUser['role'];
export type CurrentOrganization = Schemas['MeOrganizationDto'];
