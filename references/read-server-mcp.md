# read-file-server MCP 用法（加密感知的读写）

这是一套针对透明加密的读写服务。工具是 deferred MCP，需先 `ToolSearch` 加载 schema，再用 `DeferExecuteTool` 调用。

## 工具清单

| 工具 | 作用 |
|---|---|
| `read_file` | 严格 UTF8 读取，最多 40 万字符；完整返回 hash，截断返回 nextOffset |
| `write_file` | 写/追加，暂存校验后提交；支持 BOM/EOL、hash 冲突检查、禁止覆盖、`writePolicy` |
| `check_status` | 心跳；可选 `expectedHash` 做前缀一致性校验（不凭能否读取推断解密正常） |
| `inspect_write_strategy` | 判定某路径的写入策略；已有文件比较 Node 与外部读取视图，新路径可建探测样本；不改目标文件 |
| `encryption_profile` | 查看自动探测 + 手工策略；首次调用建隔离探测样本与缓存 |
| `refresh_profile` | 刷新自动探测缓存，保留手工 protected/unsafe 策略 |
| `mark_extension` | 独立保存策略：`protected` 保留受控写 / `unsafe` 必须验证明文 / `clear` 清除覆盖 |

## 读取

```json
{ "path": "绝对或相对 MCP_BASE_DIR 的路径" }
```

- 读出来是明文 → 直接用。
- 返回 hash → 记住，写回时作为 `expectedHash` 做冲突校验。

## 写入

关键参数：

- `mode`: `overwrite` | `append`
- `writePolicy`: `auto` | `preserve` | `plaintext`
  - `preserve` = 保留文件的加密/受控存储形态（加密文件写回仍加密）——protected 扩展名用它。
  - `plaintext` = 明文落盘——unsafe/clear 扩展名用它。
  - `auto` = 由服务按探测结果判定。
- `eol`: `auto`(沿用原文) | `lf` | `crlf`。加密源码多为 CRLF，用 `auto` 保留原换行。
- `overwrite`: 布尔，是否允许覆盖；默认禁止覆盖时需显式开启或走 append。
- `expectedHash`: 64 位 hex，写前校验原文未被并发改动。

```json
{
  "path": "D:\\proj\\src\\X.cpp",
  "content": "……",
  "mode": "overwrite",
  "writePolicy": "preserve",
  "eol": "auto",
  "expectedHash": "先 read_file 拿到的 hash"
}
```

## 正确的使用顺序

1. `inspect_write_strategy { path }` 看该路径该用 `preserve` 还是 `plaintext`。
2. `read_file { path }` 拿明文 + hash。
3. 用 `write_file`（带上 `expectedHash` + 正确 `writePolicy` + `eol:auto`）写回。
4. `check_status { path, expectedHash }` 校验写入后的内容一致。

## 扩展名策略标注

自动探测结果不对时，用 `mark_extension` 手工修正并持久化（刷新/TTL 不丢失）：

```json
{ "extension": "xlsx", "category": "protected" }
{ "extension": "js",  "category": "unsafe" }
```

- `protected`：该扩展名是受控/加密对象，写入必须保留加密形态。
- `unsafe`：该扩展名可能被加密，写入后必须验证明文。
- `clear`：清除手工覆盖，回到自动探测。

## 探测缓存

- `encryption_profile` 首次调用会创建隔离探测样本与缓存；之后读它看结果。
- 目录/策略变化后用 `refresh_profile` 刷新自动探测，手工 `protected/unsafe` 标注会保留。

## 与本机受信进程的关系

read-server 是第一优先的加密感知读写通道。它不可用或超时（如探测超预算）时，回退到 `node.exe` 受信进程（见 `scripts/esafe-node-edit.js`）或办公文件走 COM。
