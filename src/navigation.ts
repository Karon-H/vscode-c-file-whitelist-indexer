import * as path from "path";
import * as vscode from "vscode";
import type { DefinitionResult, TargetKind, NavigationMode } from "./types";
import { WhitelistState } from "./whitelistState";
import {
  getTargetUri,
  normalizeToArray,
} from "./utils";

/** 用于防止多次命令重入 */
let commandGuard = false;

/** 获取过滤后的跳转目标 */
async function getFilteredTargets(
  state: WhitelistState,
  editor: vscode.TextEditor,
  kind: TargetKind
): Promise<DefinitionResult[] | undefined> {
  const command =
    kind === "definition"
      ? "vscode.executeDefinitionProvider"
      : "vscode.executeImplementationProvider";
  const results = await vscode.commands.executeCommand<DefinitionResult[]>(
    command,
    editor.document.uri,
    editor.selection.active
  );
  const normalized = state.filterResults(results);
  return normalizeToArray(normalized);
}

/** 执行过滤后的导航（转到一个结果） */
export async function executeFilteredNavigation(
  state: WhitelistState,
  kind: TargetKind,
  sideBySide: boolean
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !state.isEnabled() || commandGuard) {
    await fallbackCommand(kind, sideBySide ? "aside" : "open");
    return;
  }

  commandGuard = true;
  try {
    const targets = await getFilteredTargets(state, editor, kind);
    if (!targets || targets.length === 0) {
      await fallbackCommand(kind, sideBySide ? "aside" : "open");
      return;
    }

    if (targets.length === 1) {
      await openResult(targets[0], sideBySide);
      return;
    }

    const selected = await pickResult(targets);
    if (selected) {
      await openResult(selected, sideBySide);
    }
  } finally {
    commandGuard = false;
  }
}

/** 执行过滤后的 peek 预览 */
export async function executeFilteredPeek(
  state: WhitelistState,
  kind: TargetKind
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !state.isEnabled() || commandGuard) {
    await fallbackCommand(kind, "peek");
    return;
  }

  commandGuard = true;
  try {
    const targets = await getFilteredTargets(state, editor, kind);
    if (!targets || targets.length === 0) {
      await fallbackCommand(kind, "peek");
      return;
    }

    if (targets.length === 1) {
      await openResult(targets[0], false);
      return;
    }

    await vscode.commands.executeCommand(
      "editor.action.peekLocations",
      editor.document.uri,
      editor.selection.active,
      targets,
      "peek"
    );
  } finally {
    commandGuard = false;
  }
}

/** 回退到原始命令 */
async function fallbackCommand(
  kind: TargetKind,
  mode: NavigationMode
): Promise<void> {
  if (kind === "definition") {
    if (mode === "aside") {
      await vscode.commands.executeCommand(
        "editor.action.revealDefinitionAside"
      );
      return;
    }
    if (mode === "peek") {
      await vscode.commands.executeCommand(
        "editor.action.peekDefinition"
      );
      return;
    }
    await vscode.commands.executeCommand("editor.action.revealDefinition");
    return;
  }

  if (mode === "peek") {
    await vscode.commands.executeCommand(
      "editor.action.peekImplementation"
    );
    return;
  }
  await vscode.commands.executeCommand("editor.action.goToImplementation");
}

/** 打开结果文件到编辑器 */
async function openResult(
  item: DefinitionResult,
  sideBySide: boolean
): Promise<void> {
  const uri = getTargetUri(item);
  const range =
    item instanceof vscode.Location
      ? item.range
      : item.targetSelectionRange;
  if (!uri || !range) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: sideBySide ? vscode.ViewColumn.Beside : undefined,
  });
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

/** 让用户在多个结果中选择一个 */
async function pickResult(
  items: DefinitionResult[]
): Promise<DefinitionResult | undefined> {
  const picks = items.map((item) => {
    const uri = getTargetUri(item);
    const range =
      item instanceof vscode.Location
        ? item.range
        : item.targetSelectionRange;
    const line = (range?.start.line ?? 0) + 1;
    return {
      label: uri ? path.basename(uri.fsPath) : "unknown",
      description: uri ? vscode.workspace.asRelativePath(uri, false) : "",
      detail: `Line ${line}`,
      item,
    };
  });

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: "选择要跳转的白名单结果",
  });
  return selected?.item;
}
