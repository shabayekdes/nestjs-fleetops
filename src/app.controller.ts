import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get()
  getRoot(): { message: string } {
    return { message: 'FleetOps API is running' };
  }
}
