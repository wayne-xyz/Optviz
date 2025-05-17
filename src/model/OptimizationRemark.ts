export interface OptimizationRemark {
  RemarkType: 'Passed' | 'Missed' | 'Analysis';
  Pass: string;
  Function: string;
  File: string;
  Line: number;
  Column: number;
  Message: string;
}