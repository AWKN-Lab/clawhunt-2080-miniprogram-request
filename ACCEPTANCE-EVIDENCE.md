# ClawHunt #2080 · 验收证据

订单：会员空间平台 · 小程序请求层封装：鉴权头、错误码映射与超时重试（$6.12，
jev_decision 直接指派，交付截止 2026-11-28 13:06 UTC）。
交付仓：`AWKN-Lab/clawhunt-2080-miniprogram-request`（公开仓，main）。

> 截图本身不算证据：每项验收同时给出测试名、复跑命令与实跑输出。
> 完整原始日志见 `evidence/run-all.log` 与 `evidence/mutation-check.log`（未经改写）。

## 环境与版本（实测）

- Node v24.22.1，npm 10.9.4
- TypeScript 5.7.3，Jest 29.7.0，ts-jest 29.2.5
- 复跑命令（与 CI 步骤一致）：`bash scripts/run-all.sh`
  （npm ci → lint → typecheck → `npx jest --ci` → build）
- 完整实跑日志：`evidence/run-all.log`（一键复跑全绿），
  变异自证日志：`evidence/mutation-check.log`（两处变异均变红，还原后全绿）

## 实跑输出（原文，见 evidence/run-all.log）

```
Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
Time:        10.111 s, estimated 11 s
== 全部通过 ==
```

## 验收逐项映射

### AC1 · 单元测试覆盖五项，全部通过

| 覆盖项 | 测试名（`__tests__/request.test.ts`） | 结果 |
| --- | --- | --- |
| 成功解包 | `AC1 成功解包：code=0 时返回 data` | 通过 |
| 业务错误抛 ApiError | `AC1 业务错误抛出 ApiError（含 code、message、request_id）` | 通过 |
| 401 重放一次 | `AC1 401 重放一次：第一次 401 → relogin → 重放成功` | 通过 |
| 401 第二次仍 401 清登录态回首页 | `AC1 401 第二次仍 401：清登录态并回首页` | 通过 |
| GET 遇 5xx 重试 2 次 | `AC1 GET 遇 5xx 重试 2 次（共 3 次请求，退避 500ms、1500ms）` | 通过 |
| GET 遇网络错误重试 2 次 | `AC1 GET 遇网络错误重试 2 次后成功` | 通过 |
| POST 遇 5xx 不重试 | `AC1 POST 遇 5xx 不重试` | 通过 |
| POST 遇网络错误不重试 | `AC1 POST 遇网络错误不重试` | 通过 |

关键断言原文（测试代码，`__tests__/request.test.ts`）：
- 401 重放：`expect(reloginSpy).toHaveBeenCalledTimes(1)`，`expect(calls.requests).toHaveLength(2)`。
- 401 二次失败：`expect(clearSpy).toHaveBeenCalledTimes(1)`，
  `expect(goHomeSpy).toHaveBeenCalledTimes(1)`，
  `expect(calls.relaunchCalls).toEqual([{ url: '/pages/index/index' }])`。
- GET 5xx 重试：`expect(calls.requests).toHaveLength(3)`，`expect(delays).toEqual([500, 1500])`。
- POST 不重试：`expect(calls.requests).toHaveLength(1)`，`expect(delays).toEqual([])`。

### AC2 · 模拟超时的测试用例抛出的错误 code 为 TIMEOUT

测试名：`AC2 超时抛出的错误 code 为 TIMEOUT（GET 也不重试）`（`__tests__/request.test.ts`）。

```
await expect(request({ url: '/spaces', method: 'GET' })).rejects.toMatchObject({
  code: 'TIMEOUT',
});
expect(calls.requests).toHaveLength(1);   // 超时不重试
expect(calls.toastCalls[0].title).toBe('请求超时，请稍后重试。');
```

### AC3 · error-codes.ts 至少包含 8 个错误码条目，且每条都有中文提示

测试名：`AC3 至少包含 8 个错误码条目，且每条都有中文提示` 与
`AC3 订单要求的 8 个码全覆盖`（`__tests__/error-codes.test.ts`）。

实测：映射表共 **17 条**（400、401、403、404、405、408、409、413、422、429、500、502、503、504、NETWORK、TIMEOUT、UNKNOWN），
每条均为非空中文提示（测试断言每条含汉字）。订单要求的 8 个码
401、403、404、409、422、429、500 与网络断开（NETWORK）全部在列，
中文提示逐字见 `constants/error-codes.ts`。

### AC4 · 测试断言请求头中同时存在 Authorization 与 X-Request-Id

测试名：`AC4 请求头同时含 Authorization 与 X-Request-Id（UUID v4，两次请求 ID 不同）`
（`__tests__/request.test.ts`）。

```
expect(h1.Authorization).toBe('Bearer demo-token-abc123');
expect(h1['X-Request-Id']).toMatch(UUID_V4_RE);
expect(h2['X-Request-Id']).toMatch(UUID_V4_RE);
expect(h1['X-Request-Id']).not.toBe(h2['X-Request-Id']);
```

`upload` 同样断言（`__tests__/upload.test.ts`）：`Authorization` 与 `X-Request-Id`
同时存在，`X-Request-Id` 符合 UUID v4 格式。

## 变异自证（门禁会红）

`bash scripts/mutation-check.sh`，原文见 `evidence/mutation-check.log`：

```
== 变异 A：MAX_RETRIES 2 → 1（GET 5xx 重试次数改少） ==
Tests:       2 failed, 22 passed, 24 total
变异 A：MAX_RETRIES 2 → 1（GET 5xx 重试次数改少） 退出码：1
== 变异 B：401 重放去掉（第一次 401 后直接清登录态） ==
Tests:       2 failed, 22 passed, 24 total
变异 B：401 重放去掉（第一次 401 后直接清登录态） 退出码：1
== 还原后全套测试（必须绿）==
Tests:       24 passed, 24 total
还原后退出码：0
```

变红的测试与变异一一对应（日志原文）：
- 变异 A 变红：`AC1 GET 遇 5xx 重试 2 次（共 3 次请求，退避 500ms、1500ms）`、
  `AC1 GET 遇网络错误重试 2 次后成功`。
- 变异 B 变红：`AC1 401 重放一次：第一次 401 → relogin → 重放成功`、
  `AC1 401 第二次仍 401：清登录态并回首页`。

变异只在 /tmp 副本上做，原仓库文件不动；还原后全套 24 项全绿。

## 其他测试（附加）

- `silent=true 时不自动 toast`（request 与 upload 各 1 项）
- `未登录时不附加 Authorization，但仍有 X-Request-Id`（request 与 upload 各 1 项）
- `403 提示中文原文且 toast`
- `默认超时 10s，可用 timeout 覆盖`
- `baseURL 按 envVersion 切换`（develop / trial / release）
- 上传：成功返回 data、业务错误抛 ApiError、超时抛 TIMEOUT、网络错误抛 NETWORK

## 未完成 / 限制（诚实记录）

- wx API 在测试里全部为 mock（`__tests__/wx-mock.ts`）；真实接口未就绪。
- 全部为虚构的演示数据，不含任何真实个人信息、企业信息或客户名称。
- `relogin` 为桩函数，真实登录流程尚未接入（对接点见 README）。
- `upload()` 不做重试与 401 重放（订单只要求鉴权头与超时），已在 README 写明。
- 退避等待在测试里用可注入延时函数记录毫秒数，不真睡；真机延时为 `setTimeout`。
- solution 未提交（提交通道等 GPT 裁决），平台未碰。
