import * as path from "path";
import * as vscode from "vscode";
import type { DefinitionResult, ProviderReturn } from "./types";
import { SOURCE_EXTENSIONS, HEADER_EXTENSIONS } from "./types";
import {
  loadCompileCommandsFiles,
  loadWhitelistFiles,
  resolveWorkspacePath,
  getTargetUri,
  dedupeResults,
  normalizeProviderResult,
} from "./utils";
import { normalizeFsPath } from "./pureUtils";

/** 管理白名单状态，加载和过滤源文件 */
export class WhitelistState {
  private allowedFiles = new Set<string>();

  /** 是否启用过滤 */
  public isEnabled(): boolean {
    return this.getConfig().get<boolean>("enabled", true);
  }

  /** 重新加载白名单 */
  public async reload(fromCommand: boolean): Promise<void> {
    this.allowedFiles.clear();
    const config = this.getConfig();
    const compileCommandsPath = config
      .get<string>("compileCommandsPath", "")
      .trim();
    const whitelistFile = config.get<string>("whitelistFile", "").trim();
    const messagesEnabled = config.get<boolean>("showStatusMessages", true);

    try {
      if (compileCommandsPath) {
        const resolved = resolveWorkspacePath(compileCommandsPath);
        for (const file of loadCompileCommandsFiles(resolved)) {
          this.allowedFiles.add(normalizeFsPath(file));
        }
      }

      if (whitelistFile) {
        const resolved = resolveWorkspacePath(whitelistFile);
        for (const file of loadWhitelistFiles(resolved)) {
          this.allowedFiles.add(normalizeFsPath(file));
        }
      }

      if (fromCommand && messagesEnabled) {
        const source =
          compileCommandsPath || whitelistFile
            ? `已加载 ${this.allowedFiles.size} 个白名单源文件`
            : "当前未配置白名单文件";
        void vscode.window.showInformationMessage(
          `C File Whitelist Indexer: ${source}`
        );
      }
    } catch (error) {
      if (messagesEnabled) {
        void vscode.window.showWarningMessage(
          `C File Whitelist Indexer: 白名单加载失败，${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /** 过滤定义/实现结果 */
  public filterResults(
    results: DefinitionResult[] | undefined
  ): ProviderReturn {
    if (!results || results.length === 0 || this.allowedFiles.size === 0) {
      return normalizeProviderResult(results);
    }

    const config = this.getConfig();
    const keepHeaders = config.get<boolean>("allowHeaderResults", true);
    const preferWhitelistedSource = config.get<boolean>(
      "preferWhitelistedSource",
      true
    );

    const sourceMatches: DefinitionResult[] = [];
    const headerMatches: DefinitionResult[] = [];
    const otherMatches: DefinitionResult[] = [];

    for (const item of results) {
      const uri = getTargetUri(item);
      if (!uri || uri.scheme !== "file") {
        otherMatches.push(item);
        continue;
      }

      const normalized = normalizeFsPath(uri.fsPath);
      const extension = path.extname(normalized).toLowerCase();

      if (SOURCE_EXTENSIONS.has(extension)) {
        if (this.allowedFiles.has(normalized)) {
          sourceMatches.push(item);
        }
        continue;
      }

      if (HEADER_EXTENSIONS.has(extension)) {
        if (keepHeaders) {
          headerMatches.push(item);
        }
        continue;
      }

      otherMatches.push(item);
    }

    if (preferWhitelistedSource && sourceMatches.length > 0) {
      return normalizeProviderResult(dedupeResults(sourceMatches));
    }

    const merged = dedupeResults([
      ...sourceMatches,
      ...headerMatches,
      ...otherMatches,
    ]);
    if (merged.length > 0) {
      return normalizeProviderResult(merged);
    }

    return normalizeProviderResult(results);
  }

  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("cFileWhitelistIndexer");
  }
}
