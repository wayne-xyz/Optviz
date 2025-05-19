// src/parser/llvmParser.ts
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { OptimizationRemark } from '../model/OptimizationRemark';

// Register custom tags for LLVM remarks
const customTypes = ['Missed', 'Passed', 'Analysis'].map(tag =>
  new yaml.Type('!' + tag, {
    kind: 'mapping',
    construct: (data: any) => ({ ...data, RemarkType: tag })
  })
);

const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend(customTypes);

export function parseLLVMRemarks(filePath: string): OptimizationRemark[] {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const rawRemarks = yaml.loadAll(fileContent, { schema: CUSTOM_SCHEMA });

  const parsed: OptimizationRemark[] = [];
  const metricsMap = new Map<string, { instructionsCount?: number; stackSize?: number }>();

  // First pass: collect metrics
  for (const remark of rawRemarks as Record<string, any>[]) {
    if (!remark || !remark.Function) continue;

    const functionName = remark.Function;
    if (!metricsMap.has(functionName)) {
      metricsMap.set(functionName, {});
    }

    const metrics = metricsMap.get(functionName)!;

    // Extract instruction count
    if (remark.Name === 'InstructionCount' && remark.Args) {
      const instructionCountArg = remark.Args.find((arg: any) => arg.NumInstructions);
      if (instructionCountArg) {
        metrics.instructionsCount = parseInt(instructionCountArg.NumInstructions, 10);
      }
    }

    // Extract stack size
    if (remark.Name === 'StackSize' && remark.Args) {
      const stackSizeArg = remark.Args.find((arg: any) => arg.NumStackBytes);
      if (stackSizeArg) {
        metrics.stackSize = parseInt(stackSizeArg.NumStackBytes, 10);
      }
    }
  }

  // Second pass: create remarks with metrics
  for (const remark of rawRemarks as Record<string, any>[]) {
    if (!remark || !remark.Pass || !remark.Function || !remark.DebugLoc) continue;

    const type = remark['RemarkType'] || 'Analysis';
    const functionName = remark.Function;

    const args = remark.Args || [];
    const message = args.map((arg: any) => {
      if (typeof arg === 'string') return arg;
      if (typeof arg.String === 'string') return arg.String;
      return JSON.stringify(arg); // fallback
    }).join(' ');

    parsed.push({
      RemarkType: type as OptimizationRemark['RemarkType'],
      Pass: remark.Pass,
      Function: functionName,
      File: remark.DebugLoc.File,
      Line: remark.DebugLoc.Line,
      Column: remark.DebugLoc.Column,
      Message: message,
      metrics: metricsMap.get(functionName)
    });
  }

  return parsed;
}
