import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
