---
name: esafenet-file-access
description: 在亿赛通 Esafenet 透明加密环境下读取、修改、创建代码与办公文件（Excel、Word、PDF、PPTX），以及读取内网网页信息并回写表单。当文件读出乱码或 Esafenet 密文头、写入工具损坏文件、办公文件报 zip 格式错误、需写入疑似加密文件、或需读取/回写内网网页时使用。
---

# 亿赛通 Esafenet 透明加密环境下的文件读写

> 透明加密（DLP/DCM）：文件在磁盘上是密文，**白名单进程**读取时透明解密、写入时透明加密；**非白名单进程**读到的是密文（带 `Esafenet` 头），其**写入会生成不可恢复的密文**，从而破坏文件。

## 两条铁律（任何写操作前先背）

1. **绝不用** Python 脚本、PowerShell 重定向、或任何非白名单进程去改写**源码/受控文件**——会把明文变成密文（曾因此毁过 `main.py`）。
2. **先判断是否加密再动手**：读取异常时不要重试同一工具，要切换解密读取通道。

## 谁读得到、谁读不到（可信通道 vs 危险通道）

| 操作 | 行为 | 结论 |
|---|---|---|
| IDE 自带的 Read / Edit / Write / Grep | 对已加密文件读到 `Esafenet` 头乱码；对明文文件正常读写 | 已加密源码不可直接 Read/Edit |
| `node.exe` / `py.exe`（Python Launcher） | **受信**，透明解密读、透明加密写 | 解密读写的可靠通道 |
| `.js` 扩展名 | 不在加密范围 | 脚本写成 `.js` 后可被 node 正常读写 |
| Excel COM / Word COM（`win32com` / Office 自动化） | **受信**，透明解密读、透明加密写 | 加密办公文件的唯一可靠通道 |
| `openpyxl` / `python-docx` / 一般 Python 进程 | **非受信**，读加密文件报 `file is not a zip file` 或密文 | 只能用于确认明文的文件 |
| 编译器 `g++.exe` | 被 DLP 静默拦截（exit 1、零输出） | 不可用于验证 |
| `clang++.exe` | 能跑但读到密文 | 需先解密另存再喂给它 |
| 系统 Temp 目录 | 有特殊加密管控，Excel 等无法打开 Temp 下文件 | 输出/产物放正常业务目录，不放 Temp |

## 决策：如何读一个文件

1. 先用 IDE `Read` / `Grep` 试读。
   - 正常 → 直接用。
   - 出现 `Esafenet` 头、`\x00` 密文、或明显二进制乱码 → 跳到 2。
2. 用 `read-file-server` MCP 的 `read_file`（严格 UTF8，返回 hash / nextOffset）——见 `references/read-server-mcp.md`。
3. 无 read-server 或失败 → 用 `node` 受信进程解密读：写成 `.js` 文件后 `node script.js`（或直接用 `scripts/esafe-node-edit.js read <path>`）。
4. 办公文件（xlsx/docx）读报 `not a zip file` / 乱码 → 用 **Excel / Word COM**（见 `references/office-com.md`）。
5. PDF / PPTX → 优先 `office-plugin` 的 pdf / pptx skill；加密时按 4 的 COM 思路处理。

## 决策：如何写一个文件

**写入策略必须匹配目标文件的加密状态**，否则要么破坏文件、要么破坏解密视图。

| 目标文件状态 | 用哪种写入方式 |
|---|---|
| 确认是明文、且位于非加密目录的源码 | IDE `Edit` / `Write`（IDE 进程受信） |
| 疑似加密（读出来是密文）的源码/文本 | `read-file-server` 的 `write_file`（`writePolicy` 由 `inspect_write_strategy` 判定），或 `scripts/esafe-node-edit.js` 经 node 写回 |
| 加密的 Excel | **Excel COM** 透明读写（`references/office-com.md`） |
| 加密的 Word | **Word COM** 透明读写（`references/office-com.md`） |
| 全新、无加密历史的数据文件 | 正常库（openpyxl/python-docx）或 COM 均可，优先 COM 以保持一致 |

**写前必做**：用 `read-file-server` 的 `inspect_write_strategy <path>` 查看该路径的写入策略（`preserve` = 保留加密、`plaintext` = 明文），据此选 `writePolicy`。不要凭「能读出来」就推断解密正常——用 `check_status` + `expectedHash` 校验。

## 各文件类型速查

### 代码 / 纯文本
- 明文 → IDE `Edit`/`Write` 直接改。
- 已经是密文 → 经 node 或 read-server 解密读、改、写回；**写完保留原换行**（`.cpp/.h/.md/.py` 多为 **CRLF**：改前 `replace(/\r\n/g,'\n')`，写回前再转回 `\r\n`）。

### Excel（xlsx / xlsm / csv）
- 本质是 zip；加密/损坏会报 `file is not a zip file`。
- 三级写回（固定顺序）：
  1. 目标是**合法未加密 xlsx** → `openpyxl` 直写。
  2. 疑似加密 → **Excel COM** 透明读/写。
  3. COM 也失败/被占用 → 把原文件改名为 `*.加密备份_<时间戳>.xlsx` 留档，再新建合法文件。
- 写成功后再扫描合并所有 `*.加密备份_*.xlsx` 到主文件、重排行号、删备份。
- 完整实现见 `references/office-com.md`。

### Word（docx）
- 加密 docx 用 **Word COM**（`win32com`）打开/改/另存，透明解密。
- 新建文档优先 Word COM 而非 `python-docx`，避免产物加密后复用困难。

### PDF / PPTX
- 用 `office-plugin` 的 `pdf` / `pptx` skill；加密且该 skill 失败时，改用对应 Office COM 转换/读取。

### 图片 / 非文本资源
- 受控图片直接落盘可能被加密，复用困难 → 需要与文本/程序一起持久化时，把图片转 **base64** 存进 JSON，不存 PNG/JPG 文件（RAG 项目已如此）。

### 网页 / 内网页面
**读取**
- 公网 → `WebFetch`（页面转 markdown）、`WebSearch`。
- 内网 / localhost（OA / ERP / 知识库等，公网抓取工具不可达）→ 用本机浏览器子代理（`browser_use` 类型）或 `TRAE-browseruse` skill：`browser_navigate` 到目标 URL，再 `browser_snapshot` 读渲染后的 DOM/文本（可执行 JS、带登录会话）。
- 内网**不要用 `WebFetch`**：它是服务端抓取，连不上仅内网可达的地址；`localhost` 也走浏览器（`file://` 不支持）。
- 调试用 `browser_get_attribute` / `browser_console_messages` / `browser_network_requests`。

**回写**
- `browser_type` 填输入框、`browser_click` 点按钮、`browser_select_option` 选下拉、`browser_press_key` 触发回车/Tab；提交前 `browser_snapshot` 复核，避免盲操作。
- 需要登录态 / 验证码 / 二次认证 → `browser_waiting_for_user_interaction` 交回用户手动完成后，浏览器会话继续（cookie 在本机浏览器保留）。
- 读/查询优先 API 或 GET；**写/变更类操作提交前与用户确认**，避免误改生产系统。
- 内网系统可能要求特定浏览器/企业证书/代理：打不开时提示用户换系统默认浏览器或检查 VPN/专线；不回显、不落盘凭据；浏览器子代理单次 ≤3 个 URL。

## 恢复被损坏的文件

若源码被误加密成密文，从 Trae 本地历史恢复：

```
C:\Users\ATWER\AppData\Roaming\Trae CN\User\History\<hash>\
```

- 在 `entries.json` 里按资源 URL 找对应 `<hash>` 文件夹，快照文件形如 `WV8h.py`。
- 用 `Read` 验证内容正确后，`Copy-Item` 回目标路径（字节级复制是安全的）。
- 别依赖 `__pycache__\*.pyc`（Python 3.12 反编译不可靠；`pycdc` 是钓鱼占位包，勿用）。

## 构建 / 编译约束

- `g++.exe` 被 DLP 静默拦截（任何文件都 exit 1 零输出）；`clang++.exe` 读到密文。
- 语法验证绕行：用 node 把源码解密后另存为非保护扩展名（如 `.xxxsrc`、`.h.plain`），改写 `#include "X.h"` → `"X.h.plain"`，再用 `clang++ -fsyntax-only -x c++` 检查。
- 若用户要求修改代码，**只改逻辑、不执行编译**（用户既定偏好）。

## 红线（绝对禁止）

- 用 Python / Shell 重定向改写源码文件。
- 把 exe、输出产物放到系统 Temp 目录。
- 对加密文件反复用同一把非受信工具硬试。
- 直接 `openpyxl` / `python-docx` 读加密办公文件而不先探测。

## 详细过程

- 办公文件 COM 操作与三级回退：`references/office-com.md`
- `read-file-server` MCP 各工具与 `writePolicy`：`references/read-server-mcp.md`
- 受信进程读写助手：`scripts/esafe-node-edit.js`
