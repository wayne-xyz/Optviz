// src/panels/chartDashboard.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OptimizationRemark } from '../model/OptimizationRemark';

export class ChartDashboard {
  private static panel: vscode.WebviewPanel | undefined;

  public static show(context: vscode.ExtensionContext, remarks: OptimizationRemark[]) {
    if (ChartDashboard.panel) {
      ChartDashboard.panel.reveal();
    } else {
      ChartDashboard.panel = vscode.window.createWebviewPanel(
        'optviz.chartDashboard',
        'Optimization Dashboard',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))
          ]
        }
      );

      const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'chartPanel.html');
      ChartDashboard.panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

      ChartDashboard.panel.onDidDispose(() => {
        ChartDashboard.panel = undefined;
      });
    }

    // Process optimization type data
    const chartData: Record<string, { Missed?: number; Passed?: number; Analysis?: number }> = {};
    // Process metrics data
    const metricsData: Record<string, { instructionsCount?: number; stackSize?: number }> = {};

    for (const remark of remarks) {
      const functionName = remark.Function;
      
      // Process optimization type data
      const pass = remark.Pass;
      if (!chartData[pass]) chartData[pass] = {};
      const type = remark.RemarkType;
      chartData[pass][type] = (chartData[pass][type] || 0) + 1;

      // Process metrics data
      if (remark.metrics) {
        if (!metricsData[functionName]) {
          metricsData[functionName] = {};
        }
        if (remark.metrics.instructionsCount !== undefined) {
          metricsData[functionName].instructionsCount = remark.metrics.instructionsCount;
        }
        if (remark.metrics.stackSize !== undefined) {
          metricsData[functionName].stackSize = remark.metrics.stackSize;
        }
      }
    }

    ChartDashboard.panel.webview.postMessage({
      chartData,
      metricsData,
      remarks
    });
  }
}
