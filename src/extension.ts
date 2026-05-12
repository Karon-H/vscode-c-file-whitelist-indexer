import * as vscode from "vscode";
import { WhitelistState } from "./whitelistState";
import { runConfigurationWizard } from "./config";
import { registerCommandOverrides } from "./commands";
import type { DefinitionResult } from "./types";

/** 防止 provider 重入 */
let definitionGuard = false;
let implementationGuard = false;

export function activate(context: vscode.ExtensionContext): void {
  const state = new WhitelistState();

  // ── 命令注册 ───
  context.subscriptions.push(
    vscode.commands.registerCommand("cFileWhitelistIndexer.reload", async () => {
      await state.reload(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cFileWhitelistIndexer.configure", async () => {
      await runConfigurationWizard(state);
    })
  );

  // ── 配置变更监听 ───
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("cFileWhitelistIndexer")) {
        await state.reload(false);
      }
    })
  );

  // ── Provider 注册 ───
  const selector: vscode.DocumentSelector = [
    { language: "c", scheme: "file" },
    { language: "cpp", scheme: "file" },
  ];

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition: async (document, position, _token) => {
        if (definitionGuard || !state.isEnabled()) {
          return undefined;
        }
        definitionGuard = true;
        try {
          const results =
            await vscode.commands.executeCommand<DefinitionResult[]>(
              "vscode.executeDefinitionProvider",
              document.uri,
              position
            );
          return state.filterResults(results);
        } finally {
          definitionGuard = false;
        }
      },
    })
  );

  context.subscriptions.push(
    vscode.languages.registerImplementationProvider(selector, {
      provideImplementation: async (document, position, _token) => {
        if (implementationGuard || !state.isEnabled()) {
          return undefined;
        }
        implementationGuard = true;
        try {
          const results =
            await vscode.commands.executeCommand<DefinitionResult[]>(
              "vscode.executeImplementationProvider",
              document.uri,
              position
            );
          return state.filterResults(results);
        } finally {
          implementationGuard = false;
        }
      },
    })
  );

  // ── 命令覆盖 ───
  registerCommandOverrides(context, state);

  // ── 初始加载 ───
  void state.reload(false);
}

export function deactivate(): void {}
