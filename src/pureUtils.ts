import * as path from "path";

/** 规范化路径（统一分隔符 + 小写） */
export function normalizeFsPath(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

/** 按 URI + 位置去重结果集 */
export interface DedupeItem {
  uri: string;
  line: number;
  character: number;
}

/** 通用去重函数（不依赖 vscode 类型） */
export function dedupeByKey<T extends DedupeItem>(items: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = `${item.uri}:${item.line}:${item.character}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}
