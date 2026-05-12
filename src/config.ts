import * as path from "path";
import * as vscode from "vscode";
import type { ConfigureMode } from "./types";
import { WhitelistState } from "./whitelistState";
import { getPrimaryWorkspaceFolder, toWorkspaceSettingPath } from "./utils";

/** 运行配置向导，帮助用户设置白名单来源 */
export async function runConfigurationWizard(
  state: WhitelistState
): Promise<void> {
  const folder = getPrimaryWorkspaceFolder();
  if (!folder) {
    void vscode.window.showWarningMessage(
      "C File Whitelist Indexer: 请先打开一个工作区文件夹。"
    );
    return;
  }

  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: "使用 source_whitelist 文件",
        description: "推荐，轻量，适合当前 IAR 工程",
        mode: "whitelist" as ConfigureMode,
      },
      {
        label: "使用 compile_commands 文件",
        description: "适合同时给 clangd / 语言服务器使用",
        mode: "compileCommands" as ConfigureMode,
      },
    ],
    {
      placeHolder: "选择一种白名单来源",
    }
  );

  if (!modePick) {
    return;
  }

  const filePattern =
    modePick.mode === "whitelist"
      ? "**/.vscode/source_whitelist_*.json"
      : "**/.vscode/compile_commands_*.json";

  const discovered = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, filePattern),
    "**/node_modules/**",
    50
  );

  let selectedUri: vscode.Uri | undefined;
  if (discovered.length > 0) {
    const picked = await vscode.window.showQuickPick(
      discovered.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri, false),
        description: uri.fsPath,
        uri,
      })),
      {
        placeHolder: "选择要使用的配置文件",
      }
    );
    selectedUri = picked?.uri;
  } else {
    const manual = await vscode.window.showInputBox({
      prompt:
        modePick.mode === "whitelist"
          ? "未自动发现 source_whitelist 文件，请输入相对工作区路径"
          : "未自动发现 compile_commands 文件，请输入相对工作区路径",
      value:
        modePick.mode === "whitelist"
          ? ".vscode/source_whitelist_combin_all_debug.json"
          : ".vscode/compile_commands_combin_all_debug.json",
    });
    if (!manual) {
      return;
    }
    selectedUri = vscode.Uri.file(
      path.join(folder.uri.fsPath, manual)
    );
  }

  if (!selectedUri) {
    return;
  }

  const relativePath = toWorkspaceSettingPath(folder, selectedUri);
  const config = vscode.workspace.getConfiguration(
    "cFileWhitelistIndexer",
    folder.uri
  );

  await config.update(
    "enabled",
    true,
    vscode.ConfigurationTarget.WorkspaceFolder
  );
  await config.update(
    "preferWhitelistedSource",
    true,
    vscode.ConfigurationTarget.WorkspaceFolder
  );
  await config.update(
    "allowHeaderResults",
    true,
    vscode.ConfigurationTarget.WorkspaceFolder
  );
  await config.update(
    "showStatusMessages",
    true,
    vscode.ConfigurationTarget.WorkspaceFolder
  );

  if (modePick.mode === "whitelist") {
    await config.update(
      "whitelistFile",
      relativePath,
      vscode.ConfigurationTarget.WorkspaceFolder
    );
    await config.update(
      "compileCommandsPath",
      "",
      vscode.ConfigurationTarget.WorkspaceFolder
    );
  } else {
    await config.update(
      "compileCommandsPath",
      relativePath,
      vscode.ConfigurationTarget.WorkspaceFolder
    );
    await config.update(
      "whitelistFile",
      "",
      vscode.ConfigurationTarget.WorkspaceFolder
    );
  }

  await state.reload(true);

  const action = await vscode.window.showInformationMessage(
    `C File Whitelist Indexer: 已写入工作区配置，当前使用 ${relativePath}`,
    "打开设置文件"
  );
  if (action === "打开设置文件") {
    await vscode.commands.executeCommand(
      "workbench.action.openWorkspaceSettingsFile"
    );
  }
}
