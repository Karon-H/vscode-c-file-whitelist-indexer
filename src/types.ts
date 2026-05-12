import * as vscode from "vscode";

/** 单个定义/实现结果的可能类型 */
export type DefinitionResult = vscode.Location | vscode.LocationLink;

/** Provider 返回值的可能类型 */
export type ProviderReturn = vscode.Definition | vscode.LocationLink[] | undefined;

/** 目标类型：转到定义 或 转到实现 */
export type TargetKind = "definition" | "implementation";

/** 白名单配置模式 */
export type ConfigureMode = "whitelist" | "compileCommands";

/** 跳转模式 */
export type NavigationMode = "open" | "aside" | "peek";

/** 源文件扩展名集合 */
export const SOURCE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cxx"]);

/** 头文件扩展名集合 */
export const HEADER_EXTENSIONS = new Set([".h", ".hh", ".hpp", ".hxx"]);
