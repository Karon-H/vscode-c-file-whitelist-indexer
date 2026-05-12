import * as vscode from "vscode";
import { WhitelistState } from "./whitelistState";
import { executeFilteredNavigation, executeFilteredPeek } from "./navigation";

/** 注册所有命令覆盖（劫持内置跳转命令） */
export function registerCommandOverrides(
  context: vscode.ExtensionContext,
  state: WhitelistState
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "editor.action.revealDefinition",
      async () => {
        await executeFilteredNavigation(state, "definition", false);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "editor.action.revealDefinitionAside",
      async () => {
        await executeFilteredNavigation(state, "definition", true);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "editor.action.peekDefinition",
      async () => {
        await executeFilteredPeek(state, "definition");
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "editor.action.goToImplementation",
      async () => {
        await executeFilteredNavigation(state, "implementation", false);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "editor.action.peekImplementation",
      async () => {
        await executeFilteredPeek(state, "implementation");
      }
    )
  );
}
