# 会员空间平台 · 小程序请求层封装

微信原生小程序 + TypeScript 的请求层封装：鉴权头、错误码映射与超时重试。
对应 ClawHunt 订单 #2080。

## 文件一览

| 文件 | 说明 |
| --- | --- |
| `services/request.ts` | `request<T>()`：wx.request 的 Promise 封装（鉴权头、401 重放、GET 重试、超时、toast） |
| `services/upload.ts` | `upload<T>()`：wx.uploadFile 封装（鉴权头、超时、JSON 响应解析） |
| `services/auth.ts` | 登录模块桩：token 存取、relogin、clearLogin、goHome |
| `constants/error-codes.ts` | 错误码 → 中文提示映射表（17 条） |
| `config/env.ts` | 按 envVersion（develop / trial / release）取 baseURL |
| `types/wx.d.ts` | wx 全局对象最小类型声明 |
| `__tests__/` | Jest 单元测试（32 项）与 wx mock |

## 快速开始

```bash
npm ci
npm run lint # eslint
npm run typecheck # tsc --noEmit
npm test # jest（32 项）
npm run build # tsc，产物在 dist/
bash scripts/run-all.sh # 一键复跑：npm ci → lint → typecheck → test → build
```

环境：Node 24.22.1、npm 10.9.4、TypeScript 5.7.3、Jest 29.7.0（实测版本见 ACCEPTANCE-EVIDENCE.md）。

## 使用示例

```ts
import { request} from './services/request';
import { upload} from './services/upload';

// 查询：成功返回 data（code=0 时解包）
const spaces = await request<{ id: number; name: string}[]>({
url: '/spaces',
method: 'GET',
});

// 提交：POST 不重试；业务错误抛 ApiError（含 code、message、request_id）
try {
await request({ url: '/spaces', method: 'POST', data: { name: '演示空间'}});
} catch (err) {
// err.code 如 422，err.message 为中文提示
}

// silent：不自动 toast，调用方自己处理提示
const quiet = await request({ url: '/spaces', silent: true});

// 上传：同样注入鉴权头与超时，formData 带 scene
const result = await upload<{ url: string}>('wxfile://tmp_abc.png', 'avatar');
```

## 行为规则（按订单）

- baseURL 按 `envVersion` 从 `config/env.ts` 读取：develop / trial / release 三环境。
- 每次请求自动附加 `Authorization: Bearer <token>`（未登录时不附加）与 `X-Request-Id`（UUID v4，每次请求不同）。`X-Request-Id` 由库自动生成，调用方传入同名 header 也会被覆盖，保证每次请求唯一追踪 ID 不可被调用方改写。
- 响应体统一按 `{ code, message, data}` 解析：`code=0` 返回 `data`，否则抛 `ApiError`。
- HTTP 401：调登录模块 `relogin()` 后重放原请求一次；第二次仍 401 则清除登录态并回到首页。
- 网络错误与 5xx：仅 GET 最多重试 2 次，退避 500ms、1500ms；POST / PUT / DELETE 不重试。重试决策只看 HTTP 状态码与网络错误，业务 code 不参与：HTTP 200 即使业务码为 500 也不重试；HTTP 503 即使业务码为 0 或字符串也重试。
- 默认超时 10s（`timeout` 可覆盖），超时抛 `code=TIMEOUT` 的 `ApiError`。
- 出错时默认自动 `wx.showToast` 中文提示；`silent: true` 时不自动提示。

## 配置（envVersion 切换）

真机上 `envVersion` 来自 `wx.getAccountInfoSync()`；Node 测试环境下可用
环境变量 `MINI_PROGRAM_ENV=develop|trial|release` 覆盖，或调用 `setEnvVersion()`。
当前 baseURL 均为虚构占位（`.example.invalid`），对接真实后端时在
`config/env.ts` 的 `BASE_URLS` 里替换为真实地址。

## 对接点（真实实现替换处）

- `services/auth.ts` 的 `relogin()` 目前是桩：真实实现应调 `wx.login` + 后端换 token，成功后调 `setToken()` 写入。
- token 来源：目前为模块内内存存储；真实实现应改为登录接口返回后写入，或读安全存储。
- baseURL 真实地址：见上节，改 `config/env.ts`。
- `upload()` 不做重试与 401 重放（订单只要求鉴权头与超时）；如需与 `request()` 一致，另行评估。

## 限制（诚实记录）

- wx API 在测试里全部为 mock（`__tests__/wx-mock.ts`），真实接口未就绪。
- 全部测试数据均为虚构，不含任何真实个人信息、企业信息或客户名称。
- `relogin` 为桩函数，真实登录流程尚未接入。
- 不得引入向境外发送数据的第三方 SDK；本仓库无任何第三方运行时依赖。
