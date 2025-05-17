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

  for (const remark of rawRemarks as Record<string, any>[]) {
    if (!remark || !remark.Pass || !remark.Function || !remark.DebugLoc) continue;

    const type = remark['RemarkType'] || 'Analysis';

    const args = remark.Args || [];
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg.String === 'string') return arg.String;
      return JSON.stringify(arg); // fallback
    }).join(' ');

    parsed.push({
      RemarkType: type as OptimizationRemark['RemarkType'],
      Pass: remark.Pass,
      Function: remark.Function,
      File: remark.DebugLoc.File,
      Line: remark.DebugLoc.Line,
      Column: remark.DebugLoc.Column,
      Message: message
    });
  }

  return parsed;
}
