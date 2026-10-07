import 'reflect-metadata';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { DashboardController } from './dashboard.controller.js';

describe('DashboardController roles', () => {
  const handler = (name: 'getFleet' | 'getMe'): object =>
    Object.getOwnPropertyDescriptor(DashboardController.prototype, name)
      ?.value as object;

  it('has no class-level roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DashboardController)).toBeUndefined();
  });

  it('restricts fleet to ADMIN and MANAGER', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler('getFleet'))).toEqual([
      Role.ADMIN,
      Role.MANAGER,
    ]);
  });

  it('leaves me open to any authenticated role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler('getMe'))).toBeUndefined();
  });
});
