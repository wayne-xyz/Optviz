import * as vscode from 'vscode';
import { ChartDashboard } from './views/chartDashboard';
import { parseLLVMRemarks } from './parser/llvmParser';

// Add this at the top of your file or in a .d.ts file
declare global {
  var lastLoadedRemarks: any;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "optviz" is now active!');

    // Single command: Load .opt.yaml file, parse it, and show the chart dashboard
    context.subscriptions.push(
        vscode.commands.registerCommand('optviz.loadAndShowDashboard', async () => {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'YAML files': ['yaml', 'yml'] }
            });
            if (!fileUri) return;

            try {
                const parsed = parseLLVMRemarks(fileUri[0].fsPath);
                vscode.window.showInformationMessage(`Loaded ${parsed.length} LLVM remarks`);
                globalThis['lastLoadedRemarks'] = parsed;
                ChartDashboard.show(context, parsed);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to parse YAML: ${err}`);
            }
        })
    );
}

export function deactivate() {}
