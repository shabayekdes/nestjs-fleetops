export class CostSummaryMonthDto {
  /** "YYYY-MM" */
  month: string;
  maintenanceCost: string;
  fuelCost: string;
  fuelLiters: string;
  totalCost: string;
}

export class CostSummaryTotalsDto {
  maintenanceCost: string;
  fuelCost: string;
  fuelLiters: string;
  totalCost: string;
}

export class CostSummaryResponseDto {
  from: string;
  to: string;
  months: CostSummaryMonthDto[];
  totals: CostSummaryTotalsDto;
}
