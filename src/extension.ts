import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

type DefinitionResult = vscode.Location | vscode.LocationLink;
type ProviderReturn = vscode.Definition | vscode.LocationLink[] | undefined;
type TargetKind = "definition" | "implementation";

let definitionGuard = false;
let implementationGuard = false;
let commandGuard = false;

const SOURCE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cxx"]);
const HEADER_EXTENSIONS = new Set([".h", ".hh", ".hpp", ".hxx"]);

export function activate(context: vscode.ExtensionContext): void {
  const state = new WhitelistState();

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

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("cFileWhitelistIndexer")) {
        await state.reload(false);
      }
    })
  );

  const selector: vscode.DocumentSelector = [
    { language: "c", scheme: "file" },
    { language: "cpp", scheme: "file" }
  ];

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition: async (document, position, token) => {
        if (definitionGuard || !state.isEnabled()) {
          return undefined;
        }
        definitionGuard = true;
        try {
          const results = await vscode.commands.executeCommand<DefinitionResult[]>(
            "vscode.executeDefinitionProvider",
            document.uri,
            position
          );
          return state.filterResults(results);
        } finally {
          definitionGuard = false;
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerImplementationProvider(selector, {
      provideImplementation: async (document, position, token) => {
        if (implementationGuard || !state.isEnabled()) {
          return undefined;
        }
        implementationGuard = true;
        try {
          const results = await vscode.commands.executeCommand<DefinitionResult[]>(
            "vscode.executeImplementationProvider",
            document.uri,
            position
          );
          return state.filterResults(results);
        } finally {
          implementationGuard = false;
        }
      }
    })
  );

  registerCommandOverrides(context, state);

  void state.reload(false);
}

export function deactivate(): void {}

class WhitelistState {
  private allowedFiles = new Set<string>();

  public isEnabled(): boolean {
    return this.getConfig().get<boolean>("enabled", true);
  }

  public async reload(fromCommand: boolean): Promise<void> {
    this.allowedFiles.clear();
    const config = this.getConfig();
    const compileCommandsPath = config.get<string>("compileCommandsPath", "").trim();
    const whitelistFile = config.get<string>("whitelistFile", "").trim();
    const messagesEnabled = config.get<boolean>("showStatusMessages", true);

    try {
      if (compileCommandsPath) {
        const resolved = this.resolveWorkspacePath(compileCommandsPath);
        for (const file of loadCompileCommandsFiles(resolved)) {
          this.allowedFiles.add(normalizeFsPath(file));
        }
      }

      if (whitelistFile) {
        const resolved = this.resolveWorkspacePath(whitelistFile);
        for (const file of loadWhitelistFiles(resolved)) {
          this.allowedFiles.add(normalizeFsPath(file));
        }
      }

      if (fromCommand && messagesEnabled) {
        const source = compileCommandsPath || whitelistFile
          ? `已加载 ${this.allowedFiles.size} 个白名单源文件`
          : "当前未配置白名单文件";
        void vscode.window.showInformationMessage(`C File Whitelist Indexer: ${source}`);
      }
    } catch (error) {
      if (messagesEnabled) {
        void vscode.window.showWarningMessage(
          `C File Whitelist Indexer: 白名单加载失败，${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  public filterResults(
    results: DefinitionResult[] | undefined
  ): ProviderReturn {
    if (!results || results.length === 0 || this.allowedFiles.size === 0) {
      return normalizeProviderResult(results);
    }

    const config = this.getConfig();
    const keepHeaders = config.get<boolean>("allowHeaderResults", true);
    const preferWhitelistedSource = config.get<boolean>("preferWhitelistedSource", true);

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

    const merged = dedupeResults([...sourceMatches, ...headerMatches, ...otherMatches]);
    if (merged.length > 0) {
      return normalizeProviderResult(merged);
    }

    return normalizeProviderResult(results);
  }

  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("cFileWhitelistIndexer");
  }

  private resolveWorkspacePath(rawPath: string): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return rawPath;
    }

    const workspaceFolder = folders[0].uri.fsPath;
    return rawPath
      .replace(/\$\{workspaceFolder\}/gi, workspaceFolder)
      .replace(/\//g, path.sep);
  }
}

type ConfigureMode = "whitelist" | "compileCommands";

async function runConfigurationWizard(state: WhitelistState): Promise<void> {
  const folder = getPrimaryWorkspaceFolder();
  if (!folder) {
    void vscode.window.showWarningMessage("C File Whitelist Indexer: 请先打开一个工作区文件夹。");
    return;
  }

  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: "使用 source_whitelist 文件",
        description: "推荐，轻量，适合当前 IAR 工程",
        mode: "whitelist" as ConfigureMode
      },
      {
        label: "使用 compile_commands 文件",
        description: "适合同时给 clangd / 语言服务器使用",
        mode: "compileCommands" as ConfigureMode
      }
    ],
    {
      placeHolder: "选择一种白名单来源"
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
        uri
      })),
      {
        placeHolder: "选择要使用的配置文件"
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
          : ".vscode/compile_commands_combin_all_debug.json"
    });
    if (!manual) {
      return;
    }
    selectedUri = vscode.Uri.file(path.join(folder.uri.fsPath, manual));
  }

  if (!selectedUri) {
    return;
  }

  const relativePath = toWorkspaceSettingPath(folder, selectedUri);
  const config = vscode.workspace.getConfiguration("cFileWhitelistIndexer", folder.uri);

  await config.update("enabled", true, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("preferWhitelistedSource", true, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("allowHeaderResults", true, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("showStatusMessages", true, vscode.ConfigurationTarget.WorkspaceFolder);

  if (modePick.mode === "whitelist") {
    await config.update("whitelistFile", relativePath, vscode.ConfigurationTarget.WorkspaceFolder);
    await config.update("compileCommandsPath", "", vscode.ConfigurationTarget.WorkspaceFolder);
  } else {
    await config.update("compileCommandsPath", relativePath, vscode.ConfigurationTarget.WorkspaceFolder);
    await config.update("whitelistFile", "", vscode.ConfigurationTarget.WorkspaceFolder);
  }

  await state.reload(true);

  const action = await vscode.window.showInformationMessage(
    `C File Whitelist Indexer: 已写入工作区配置，当前使用 ${relativePath}`,
    "打开设置文件"
  );
  if (action === "打开设置文件") {
    await vscode.commands.executeCommand("workbench.action.openWorkspaceSettingsFile");
  }
}

function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0];
}

function toWorkspaceSettingPath(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
  const relative = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\//g, "\\");
  return `\${workspaceFolder}\\${relative}`;
}

function loadCompileCommandsFiles(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as Array<{ file?: string }>;
  return payload
    .map((item) => item.file?.trim())
    .filter((item): item is string => Boolean(item));
}

function loadWhitelistFiles(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as { files?: string[] };
  if (!Array.isArray(payload.files)) {
    throw new Error("whitelistFile 需要是 { \"files\": [...] } 结构。");
  }
  return payload.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeFsPath(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function getTargetUri(item: DefinitionResult): vscode.Uri | undefined {
  if (item instanceof vscode.Location) {
    return item.uri;
  }
  return item.targetUri;
}

function dedupeResults(items: DefinitionResult[]): DefinitionResult[] {
  const seen = new Set<string>();
  const output: DefinitionResult[] = [];

  for (const item of items) {
    const uri = getTargetUri(item);
    const range = item instanceof vscode.Location ? item.range : item.targetSelectionRange;
    const line = range?.start.line ?? -1;
    const character = range?.start.character ?? -1;
    const key = `${uri?.toString() ?? "unknown"}:${line}:${character}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

function normalizeProviderResult(results: DefinitionResult[] | undefined): ProviderReturn {
  if (!results) {
    return undefined;
  }

  if (results.length === 0) {
    return [];
  }

  const hasLocationLink = results.some((item) => !(item instanceof vscode.Location));
  if (hasLocationLink) {
    return results.filter((item): item is vscode.LocationLink => !(item instanceof vscode.Location));
  }

  return results.filter((item): item is vscode.Location => item instanceof vscode.Location);
}

function registerCommandOverrides(
  context: vscode.ExtensionContext,
  state: WhitelistState
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("editor.action.revealDefinition", async () => {
      await executeFilteredNavigation(state, "definition", false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("editor.action.revealDefinitionAside", async () => {
      await executeFilteredNavigation(state, "definition", true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("editor.action.peekDefinition", async () => {
      await executeFilteredPeek(state, "definition");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("editor.action.goToImplementation", async () => {
      await executeFilteredNavigation(state, "implementation", false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("editor.action.peekImplementation", async () => {
      await executeFilteredPeek(state, "implementation");
    })
  );
}

async function executeFilteredNavigation(
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

async function executeFilteredPeek(state: WhitelistState, kind: TargetKind): Promise<void> {
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

    await vscode.commands.executeCommand("editor.action.peekLocations", editor.document.uri, editor.selection.active, targets, "peek");
  } finally {
    commandGuard = false;
  }
}

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

async function fallbackCommand(
  kind: TargetKind,
  mode: "open" | "aside" | "peek"
): Promise<void> {
  if (kind === "definition") {
    if (mode === "aside") {
      await vscode.commands.executeCommand("editor.action.revealDefinitionAside");
      return;
    }
    if (mode === "peek") {
      await vscode.commands.executeCommand("editor.action.peekDefinition");
      return;
    }
    await vscode.commands.executeCommand("editor.action.revealDefinition");
    return;
  }

  if (mode === "peek") {
    await vscode.commands.executeCommand("editor.action.peekImplementation");
    return;
  }
  await vscode.commands.executeCommand("editor.action.goToImplementation");
}

function normalizeToArray(results: ProviderReturn): DefinitionResult[] | undefined {
  if (!results) {
    return undefined;
  }
  return Array.isArray(results) ? results : [results];
}

async function openResult(item: DefinitionResult, sideBySide: boolean): Promise<void> {
  const uri = getTargetUri(item);
  const range = item instanceof vscode.Location ? item.range : item.targetSelectionRange;
  if (!uri || !range) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: sideBySide ? vscode.ViewColumn.Beside : undefined
  });
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function pickResult(items: DefinitionResult[]): Promise<DefinitionResult | undefined> {
  const picks = items.map((item) => {
    const uri = getTargetUri(item);
    const range = item instanceof vscode.Location ? item.range : item.targetSelectionRange;
    const line = (range?.start.line ?? 0) + 1;
    return {
      label: uri ? path.basename(uri.fsPath) : "unknown",
      description: uri ? vscode.workspace.asRelativePath(uri, false) : "",
      detail: `Line ${line}`,
      item
    };
  });

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: "选择要跳转的白名单结果"
  });
  return selected?.item;
}
