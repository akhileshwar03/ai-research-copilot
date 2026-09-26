export interface ChartDataPoint {
  label: string; // YYYY-MM-DD or category name
  value: number;
  compareValue?: number;
  color?: string;
}
