import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { DefinitionResult, ProviderReturn } from "./types";
import { dedupeByKey } from "./pureUtils";

// ── 文件加载 ────────────────────────────────────────────────

/** 从 compile_commands.json 中提取文件列表 */
export function loadCompileCommandsFiles(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as Array<{ file?: string }>;
  return payload
    .map((item) => item.file?.trim())
    .filter((item): item is string => Boolean(item));
}

/** 从 whitelist JSON 文件中提取文件列表 */
export function loadWhitelistFiles(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as { files?: string[] };
  if (!Array.isArray(payload.files)) {
    throw new Error('whitelistFile 需要是 { "files": [...] } 结构。');
  }
  return payload.files.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

// ── 工作区路径 ──────────────────────────────────────────────

/** 将 ${workspaceFolder} 占位符替换为实际路径 */
export function resolveWorkspacePath(rawPath: string): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return rawPath;
  }
  const workspaceFolder = folders[0].uri.fsPath;
  return rawPath
    .replace(/\$\{workspaceFolder\}/gi, workspaceFolder)
    .replace(/\//g, path.sep);
}

/** 生成工作区设置路径（${workspaceFolder}\\... 格式） */
export function toWorkspaceSettingPath(
  folder: vscode.WorkspaceFolder,
  uri: vscode.Uri
): string {
  const relativePath = path
    .relative(folder.uri.fsPath, uri.fsPath)
    .replace(/\//g, "\\");
  return `\${workspaceFolder}\\${relativePath}`;
}

/** 获取主工作区文件夹 */
export function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0];
}

// ── 结果处理 ────────────────────────────────────────────────

/** 获取结果项的 URI */
export function getTargetUri(item: DefinitionResult): vscode.Uri | undefined {
  if (item instanceof vscode.Location) {
    return item.uri;
  }
  return item.targetUri;
}

/** 按位置去重 */
export function dedupeResults(items: DefinitionResult[]): DefinitionResult[] {
  const mapped = items.map((item) => {
    const uri = getTargetUri(item);
    const range =
      item instanceof vscode.Location
        ? item.range
        : item.targetSelectionRange;
    return {
      original: item,
      uri: uri?.toString() ?? "unknown",
      line: range?.start.line ?? -1,
      character: range?.start.character ?? -1,
    };
  });
  return dedupeByKey(mapped).map((m) => m.original);
}

/** 将结果规范化为 ProviderReturn 类型 */
export function normalizeProviderResult(
  results: DefinitionResult[] | undefined
): ProviderReturn {
  if (!results) {
    return undefined;
  }

  if (results.length === 0) {
    return [];
  }

  const hasLocationLink = results.some(
    (item) => !(item instanceof vscode.Location)
  );
  if (hasLocationLink) {
    return results.filter(
      (item): item is vscode.LocationLink => !(item instanceof vscode.Location)
    );
  }

  return results.filter(
    (item): item is vscode.Location => item instanceof vscode.Location
  );
}

/** 将 ProviderReturn 转回数组形式 */
export function normalizeToArray(
  results: ProviderReturn
): DefinitionResult[] | undefined {
  if (!results) {
    return undefined;
  }
  return Array.isArray(results) ? results : [results];
}
