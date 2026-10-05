import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID('7')
  vehicleId: string;

  @IsUUID('7')
  driverId: string;
}
