# 网页 / 内网页面信息读取与回写

## 工具选择

| 场景 | 工具 |
|---|---|
| 公网页面读取 | `WebFetch`（页面转 markdown）、`WebSearch` |
| 内网页面读取（OA / ERP / 知识库 / localhost） | 本机浏览器子代理（`browser_use` 类型）或 `TRAE-browseruse` skill |
| 表单填写 / 提交 / 更新记录 | `browser_type` / `browser_click` / `browser_select_option` / `browser_press_key` |

## 读取网页信息

1. **公网**：`WebFetch` 抓取 URL 转 markdown；需要实时检索用 `WebSearch`。
2. **内网 / localhost**：
   - 用本机浏览器子代理 `browser_navigate` 到目标 URL，再 `browser_snapshot` 读取渲染后的 DOM/文本（可执行 JS、携带登录会话）。
   - `localhost` 也走浏览器通道（`file://` 不支持）。
3. **内网不要用 `WebFetch`**：它是服务端抓取，连不上仅内网可达的地址；必须走本机浏览器。
4. 页面元素/状态可用 `browser_get_attribute` 读属性、`browser_console_messages` 看控制台报错、`browser_network_requests` 抓网络请求辅助定位。

## 回写信息（填表单 / 提交 / 更新）

1. 先 `browser_snapshot` 确认当前页面与目标元素，避免盲操作。
2. 用 `browser_type` 填输入框、`browser_select_option` 选下拉、`browser_click` 点按钮、`browser_press_key` 触发回车/Tab。
3. 提交前再 `browser_snapshot` 复核即将写入的内容。
4. 读/查询类优先走 API 或 GET；**写/变更类操作提交前与用户确认**，避免误改生产系统。

## 登录态 / 验证码 / 二次认证

- 需要登录、验证码或二次认证时，用 `browser_waiting_for_user_interaction` 把控制权交回用户手动完成；完成后浏览器会话继续，会话 cookie 在本机浏览器内保留。
- 不回显、不落盘登录凭据；会话仅在本机浏览器子代理内有效。

## 注意事项

- 内网系统可能要求特定浏览器、企业证书或代理：浏览器打不开时，提示用户改用系统默认浏览器或检查 VPN/专线。
- `browser_use` 子代理单次最多 3 个 URL；超过则拆分多次并行。
- 若页面结构与预期不符，优先怀疑登录态失效或需要先点开详情/展开项，用 `browser_snapshot` 逐屏确认再操作。
