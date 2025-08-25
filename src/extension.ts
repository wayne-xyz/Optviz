// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ChartDashboard } from './views/chartDashboard';
import { parseLLVMRemarksStream } from './parser/llvmParser';
import { OptimizationRemark } from './model/OptimizationRemark';

declare global {
  // eslint-disable-next-line no-var
  var lastLoadedRemarks: OptimizationRemark[] | undefined;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('optviz active.');

  context.subscriptions.push(
    vscode.commands.registerCommand('optviz.loadAndShowDashboard', async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'YAML files': ['yaml', 'yml'] }
      });
      if (!fileUri || fileUri.length === 0) return;

      const filePath = fileUri[0].fsPath;

      // (optional) file size for nicer logs
      let fileSize = 0;
      try { fileSize = fs.statSync(filePath).size; } catch { /* ignore */ }

      try {
        const start = Date.now();
        let count = 0;
        let lastLoggedAt = start;
        let lastCount = 0;

        // throttle settings
        const LOG_EVERY_N = 2_000;       // log every N remarks
        const LOG_EVERY_MS = 1_000;      // or at least once per second

        console.log(`[optviz] parsing started: ${filePath}${fileSize ? ` (${(fileSize / (1024*1024)).toFixed(1)} MB)` : ''}`);

        const parsed = await vscode.window.withProgress<OptimizationRemark[]>(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: 'Parsing LLVM optimization remarks…'
          },
          async (progress) => {
            progress.report({ message: 'Reading and parsing…' });

            const result = await parseLLVMRemarksStream(filePath, {
              onRemark: async () => {
                count++;

                const now = Date.now();
                const dtSinceLast = now - lastLoggedAt;

                if (count % LOG_EVERY_N === 0 || dtSinceLast >= LOG_EVERY_MS) {
                  const elapsedSec = (now - start) / 1000;
                  const deltaCount = count - lastCount;
                  const instRate = deltaCount / (dtSinceLast / 1000 || 1);
                  const avgRate = count / (elapsedSec || 1);

                  const mem = process.memoryUsage();
                  const rssMB = (mem.rss / (1024 * 1024)).toFixed(1);
                  const heapMB = (mem.heapUsed / (1024 * 1024)).toFixed(1);

                  console.log(
                    `[optviz] parsed=${count.toLocaleString()} | inst=${instRate.toFixed(0)}/s | avg=${avgRate.toFixed(0)}/s | rss=${rssMB} MB | heap=${heapMB} MB`
                  );

                  lastLoggedAt = now;
                  lastCount = count;

                  // also nudge the UI progress text occasionally
                  progress.report({ message: `Parsed ${count.toLocaleString()} remarks…` });
                }
              }
            });

            progress.report({ message: `Finalizing (${result.length.toLocaleString()} remarks)…` });
            return result;
          }
        );

        const totalSec = (Date.now() - start) / 1000;
        console.log(`[optviz] parsing finished: ${parsed.length.toLocaleString()} remarks in ${totalSec.toFixed(1)}s (${(parsed.length / (totalSec || 1)).toFixed(0)}/s)`);

        vscode.window.showInformationMessage(`Loaded ${parsed.length.toLocaleString()} LLVM remarks`);
        globalThis.lastLoadedRemarks = parsed;

        ChartDashboard.show(context, parsed);
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('[optviz] parsing failed:', msg);
        vscode.window.showErrorMessage(`Failed to parse YAML: ${msg}`);
      }
    })
  );
}

export function deactivate() {}
