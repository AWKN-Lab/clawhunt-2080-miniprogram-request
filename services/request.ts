// 请求层封装：把 wx.request 封装为 Promise 风格的 request<T>()。
// 行为（按订单）：
// - baseURL 按 envVersion 从 config/env.ts 读取；
// - 自动附加 Authorization: Bearer <token> 与 X-Request-Id（UUID v4）；
//   X-Request-Id 由库自动生成，调用方传入同名 header 也会被覆盖（每次请求唯一追踪 ID 不可改写）；
// - 统一解析响应体 { code, message, data }，code=0 返回 data，否则抛 ApiError；
// - HTTP 401 时调登录模块 relogin() 后重放原请求一次，第二次仍 401 则清登录态并回首页；
// - 网络错误与 5xx 仅对 GET 最多重试 2 次（退避 500ms、1500ms），POST/PUT/DELETE 不重试；
//   重试决策只看 HTTP 状态码与网络错误，业务 code 不参与：HTTP 200 配业务码 500 不重试，
//   HTTP 503 配业务码 0 或字符串业务码仍重试；
// - 默认超时 10s，超时抛 code=TIMEOUT 的 ApiError；
// - 错误时按 silent 参数决定是否自动 toast 中文提示。

import { getBaseURL } from '../config/env';
import { getErrorMessage } from '../constants/error-codes';
import { clearLogin, getToken, goHome, relogin } from './auth';

export const DEFAULT_TIMEOUT = 10000;
export const MAX_RETRIES = 2;
export const RETRY_DELAYS_MS: number[] = [500, 1500];

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  url: string;
  method?: HttpMethod;
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  silent?: boolean;
}

export interface ApiResponseBody {
  code: number | string;
  message?: string;
  data?: unknown;
}

/** 业务错误：含 code、message 与本次请求的 request_id。 */
export class ApiError extends Error {
  code: string | number;
  requestId: string;
  /** 本次请求的 HTTP 状态码（网络错误 / 超时时为 undefined）。 */
  statusCode?: number;

  constructor(
    code: string | number,
    message: string,
    requestId: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
    this.statusCode = statusCode;
  }
}

/** 生成 UUID v4（不依赖外部库，真机与 Node 均可用）。 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 退避等待实现：默认真延时；测试可注入记录型 / 假延时，避免真睡 500ms+1500ms。
let delayImpl: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 测试用：注入自定义延时实现。 */
export function __setDelayImpl(fn: (ms: number) => Promise<void>): void {
  delayImpl = fn;
}

/** 测试用：恢复默认延时实现。 */
export function __resetDelayImpl(): void {
  delayImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(errMsg: string): boolean {
  return errMsg.toLowerCase().includes('timeout');
}

/**
 * 是否可重试：只看 HTTP 状态码与网络错误，业务 code 不参与决策。
 * - fail 回调的网络错误（code='NETWORK'，无 statusCode）：可重试；
 * - HTTP 5xx（statusCode 500–599）：可重试；
 * - HTTP 200 配业务码 500：statusCode=200，不重试；
 * - HTTP 200 配业务码 'NETWORK'：statusCode=200 已定义，不重试
 *   （业务码字符串与网络错误同名时不误判）；
 * - 超时（code='TIMEOUT'，无 statusCode）：不重试。
 */
function isRetryable(err: ApiError): boolean {
  if (err.statusCode === undefined && err.code === 'NETWORK') {
    return true;
  }
  return typeof err.statusCode === 'number' && err.statusCode >= 500 && err.statusCode < 600;
}

function showErrorToast(code: string | number): void {
  wx.showToast({ title: getErrorMessage(code), icon: 'none', duration: 2000 });
}

interface SingleCallResult {
  statusCode: number;
  body: ApiResponseBody | null;
}

/** 单次 wx.request 调用（不含重试 / 401 重放），把结果归一为 ApiResponseBody。 */
function wxRequestOnce(options: RequestOptions, requestId: string): Promise<SingleCallResult> {
  const token = getToken();
  const header: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.header || {}),
    // 自动生成的 X-Request-Id 永远最后写入：调用方传入同名 header 也会被覆盖，
    // 每次请求唯一追踪 ID 不可被调用方改写。
    'X-Request-Id': requestId,
  };
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise<SingleCallResult>((resolve, reject) => {
    wx.request({
      url: getBaseURL() + options.url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      dataType: 'json',
      success: (res) => {
        const body = (res.data || {}) as ApiResponseBody;
        resolve({ statusCode: res.statusCode, body });
      },
      fail: (err) => {
        const errMsg = (err && err.errMsg) || '';
        if (isTimeoutError(errMsg)) {
          reject(new ApiError('TIMEOUT', getErrorMessage('TIMEOUT'), requestId));
        } else {
          reject(new ApiError('NETWORK', getErrorMessage('NETWORK'), requestId));
        }
      },
    });
  });
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const method = options.method || 'GET';
  const silent = options.silent ?? false;
  let replayed = false;
  let retryCount = 0;

  for (;;) {
    const requestId = uuidv4();
    try {
      const { statusCode, body } = await wxRequestOnce(options, requestId);
      const code = body && body.code !== undefined ? body.code : statusCode;
      const message =
        (body && body.message) || getErrorMessage(statusCode === 200 ? code : statusCode);

      if (statusCode === 401) {
        throw new ApiError(401, message, requestId, 401);
      }
      if (statusCode >= 200 && statusCode < 300 && code === 0) {
        return body ? (body.data as T) : (undefined as unknown as T);
      }
      if (statusCode >= 200 && statusCode < 300) {
        // 业务错误：statusCode 带上真实的 HTTP 状态码（2xx），重试决策不看业务 code。
        throw new ApiError(code, message, requestId, statusCode);
      }
      throw new ApiError(statusCode, message, requestId, statusCode);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        throw err;
      }

      // 401：先重放一次；第二次仍 401 则清登录态并回首页。
      if (err.code === 401) {
        if (!replayed) {
          replayed = true;
          await relogin();
          continue;
        }
        clearLogin();
        goHome();
        if (!silent) {
          showErrorToast(err.code);
        }
        throw err;
      }

      // 网络错误与 5xx：仅 GET 最多重试 2 次（退避 500ms、1500ms）。
      // 重试依据只看 HTTP 状态码与网络错误，业务 code 不参与决策。
      if (isRetryable(err) && method === 'GET' && retryCount < MAX_RETRIES) {
        await delayImpl(RETRY_DELAYS_MS[retryCount]);
        retryCount += 1;
        continue;
      }

      if (!silent) {
        showErrorToast(err.code);
      }
      throw err;
    }
  }
}
