import * as assert from "assert";

// 注意：Utils 中依赖 vscode 的部分需在 VS Code 宿主环境测试
import { normalizeFsPath, dedupeByKey } from "../pureUtils";
import { SOURCE_EXTENSIONS, HEADER_EXTENSIONS } from "../types";

describe("utils 测试", () => {
  it("normalizeFsPath 统一分隔符和小写", () => {
    const result = normalizeFsPath("C:\\Project\\Foo.C");
    // 在 Windows 上 normalize 会保留盘符和反斜杠
    assert.ok(result.endsWith("foo.c"));
  });

  it("SOURCE_EXTENSIONS 包含常见源文件扩展名", () => {
    assert.ok(SOURCE_EXTENSIONS.has(".c"));
    assert.ok(SOURCE_EXTENSIONS.has(".cc"));
    assert.ok(SOURCE_EXTENSIONS.has(".cpp"));
    assert.ok(SOURCE_EXTENSIONS.has(".cxx"));
    assert.strictEqual(SOURCE_EXTENSIONS.size, 4);
  });

  it("HEADER_EXTENSIONS 包含常见头文件扩展名", () => {
    assert.ok(HEADER_EXTENSIONS.has(".h"));
    assert.ok(HEADER_EXTENSIONS.has(".hh"));
    assert.ok(HEADER_EXTENSIONS.has(".hpp"));
    assert.ok(HEADER_EXTENSIONS.has(".hxx"));
    assert.strictEqual(HEADER_EXTENSIONS.size, 4);
  });

  it("dedupeByKey 剔除相同 URI+位置的结果", () => {
    const items = [
      { uri: "file:///a.c", line: 10, character: 5 },
      { uri: "file:///a.c", line: 10, character: 5 },
      { uri: "file:///b.c", line: 10, character: 5 },
    ];

    const result = dedupeByKey(items);
    assert.strictEqual(result.length, 2);
  });
});
