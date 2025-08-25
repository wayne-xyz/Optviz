import * as fs from 'fs';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import { OptimizationRemark } from '../model/OptimizationRemark';

// Register custom tags for LLVM remarks
const customTypes = ['Missed', 'Passed', 'Analysis'].map(tag =>
  new yaml.Type('!' + tag, {
    kind: 'mapping',
    construct: (data: any) => ({ ...data, RemarkType: tag as OptimizationRemark['RemarkType'] })
  })
);
const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend(customTypes);

type Metrics = NonNullable<OptimizationRemark['metrics']>;

export type ParseOptions = {
  /** Stream each remark as it's parsed */
  onRemark?: (r: OptimizationRemark) => void | Promise<void>;
  /** For previews/testing */
  limit?: number;
  /** Optional cancellation signal */
  signal?: AbortSignal;
};

/**
 * Efficiently stream-parse multi-document YAML LLVM remarks.
 * - No full-file read
 * - One pass with metrics backfill
 * - Preserves header tags (--- !Passed/!Missed/!Analysis)
 */
export async function parseLLVMRemarksStream(
  filePath: string,
  opts: ParseOptions = {}
): Promise<OptimizationRemark[]> {
  const { onRemark, limit, signal } = opts;

  const results: OptimizationRemark[] = [];
  const metricsMap = new Map<string, Metrics>();         // fn -> metrics
  const pendingByFunction = new Map<string, number[]>(); // fn -> remark indices missing metrics

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  if (signal) {
    const onAbort = () => stream.destroy(new Error('Aborted'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    rl.on('close', () => signal.removeEventListener?.('abort', onAbort as any));
  }

  let buf: string[] = [];
  let inDoc = false;

  const processDoc = async (docText: string) => {
    if (!docText.trim()) return;
    if (signal?.aborted) throw new Error('Aborted');

    let remark: any;
    try {
      remark = yaml.load(docText, { schema: CUSTOM_SCHEMA });
    } catch {
      // Skip malformed docs rather than failing the whole parse
      return;
    }
    if (!remark || typeof remark !== 'object') return;

    // Fallback: if custom tag didn't populate RemarkType, extract from the header
    if (!remark.RemarkType) {
      const m = docText.match(/^---\s*!([A-Za-z]+)\b/m);
      if (m && (m[1] === 'Passed' || m[1] === 'Missed' || m[1] === 'Analysis')) {
        remark.RemarkType = m[1];
      }
    }

    // Update metrics if this is a metrics doc
    if (remark.Function && remark.Args && remark.Name) {
      const fn = String(remark.Function);
      let m = metricsMap.get(fn);
      if (!m) {
        m = {};
        metricsMap.set(fn, m);
      }
      if (remark.Name === 'InstructionCount') {
        const arg = Array.isArray(remark.Args) ? remark.Args.find((a: any) => a?.NumInstructions != null) : undefined;
        const v = Number(arg?.NumInstructions);
        if (!Number.isNaN(v)) m.instructionsCount = v;
      }
      if (remark.Name === 'StackSize') {
        const arg = Array.isArray(remark.Args) ? remark.Args.find((a: any) => a?.NumStackBytes != null) : undefined;
        const v = Number(arg?.NumStackBytes);
        if (!Number.isNaN(v)) m.stackSize = v;
      }
    }

    // Create an OptimizationRemark if it's a remark doc
    if (remark.Pass && remark.Function && remark.DebugLoc) {
      const type = (remark['RemarkType'] as OptimizationRemark['RemarkType']) ?? 'Analysis';
      const functionName = String(remark.Function);

      const args = Array.isArray(remark.Args) ? remark.Args : [];
      const message = args.map((arg: any) => {
        if (typeof arg === 'string') return arg;
        if (arg && typeof arg.String === 'string') return arg.String;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ');

      const out: OptimizationRemark = {
        RemarkType: type,
        Pass: String(remark.Pass),
        Function: functionName,
        File: String(remark.DebugLoc.File ?? ''),
        Line: Number(remark.DebugLoc.Line ?? 0),
        Column: Number(remark.DebugLoc.Column ?? 0),
        Message: message,
        metrics: metricsMap.get(functionName)
      };

      const idx = results.push(out) - 1;

      // Track for backfill if metrics not yet known
      if (!out.metrics) {
        const arr = pendingByFunction.get(functionName) ?? [];
        arr.push(idx);
        pendingByFunction.set(functionName, arr);
      }

      if (onRemark) await onRemark(out);

      if (limit && results.length >= limit) {
        rl.close();
        stream.destroy();
      }
    }

    // Backfill any remarks now that metrics may have appeared
    if (remark.Function) {
      const fn = String(remark.Function);
      const m = metricsMap.get(fn);
      if (m && pendingByFunction.has(fn)) {
        for (const i of pendingByFunction.get(fn)!) {
          if (!results[i].metrics) results[i].metrics = m;
        }
        pendingByFunction.delete(fn);
      }
    }
  };

  for await (const line of rl) {
    // Start of a new document (may include a tag like '--- !Passed')
    if (line.startsWith('---')) {
      if (inDoc && buf.length) {
        const docText = buf.join('\n');
        buf = [];
        await processDoc(docText);
      }
      inDoc = true;
      // KEEP the header line so js-yaml sees the tag
      buf.push(line);
      continue;
    }
    // Optional YAML end marker: process current doc and reset
    if (line.trim() === '...') {
      if (buf.length) {
        const docText = buf.join('\n');
        buf = [];
        await processDoc(docText);
      }
      inDoc = false;
      continue;
    }
    if (!inDoc) continue;
    buf.push(line);
  }

  // Process last buffered doc
  if (buf.length) {
    const docText = buf.join('\n');
    await processDoc(docText);
  }

  return results;
}
