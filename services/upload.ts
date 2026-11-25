// 文件上传封装：把 wx.uploadFile 封装为 Promise 风格的 upload<T>()。
// 与 request.ts 同样注入 Authorization 与 X-Request-Id，并设默认超时 10s；
// 统一解析响应体 { code, message, data }（上传接口返回 JSON 字符串），
// code=0 返回 data，否则抛 ApiError；超时抛 code=TIMEOUT。
// 注意：upload 不做重试与 401 重放（订单只要求鉴权头与超时），失败直接抛错。

import { getBaseURL } from '../config/env';
import { getErrorMessage } from '../constants/error-codes';
import { getToken } from './auth';
import { ApiError, DEFAULT_TIMEOUT, uuidv4 } from './request';

export interface UploadOptions {
  timeout?: number;
  silent?: boolean;
}

/**
 * 上传文件。
 * @param filePath 本地临时文件路径（wx.chooseMedia 等返回的 tempFilePath）
 * @param scene 业务场景（例如 'avatar' / 'feedback'，原样放进 formData）
 */
export async function upload<T>(
  filePath: string,
  scene: string,
  options: UploadOptions = {},
): Promise<T> {
  const requestId = uuidv4();
  const silent = options.silent ?? false;
  const token = getToken();
  const header: Record<string, string> = { 'X-Request-Id': requestId };
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      wx.uploadFile({
        url: getBaseURL() + '/upload',
        filePath,
        name: 'file',
        header,
        formData: { scene },
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
        success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
        fail: (err) => {
          const errMsg = (err && err.errMsg) || '';
          if (errMsg.toLowerCase().includes('timeout')) {
            reject(new ApiError('TIMEOUT', getErrorMessage('TIMEOUT'), requestId));
          } else {
            reject(new ApiError('NETWORK', getErrorMessage('NETWORK'), requestId));
          }
        },
      });
    });

    let body: { code?: number | string; message?: string; data?: unknown } = {};
    try {
      body = JSON.parse(res.data || '{}') as typeof body;
    } catch {
      throw new ApiError(res.statusCode, '响应解析失败，请稍后重试。', requestId);
    }

    const code = body.code !== undefined ? body.code : res.statusCode;
    const message = body.message || getErrorMessage(res.statusCode);
    if (res.statusCode >= 200 && res.statusCode < 300 && code === 0) {
      return body.data as T;
    }
    throw new ApiError(code, message, requestId);
  } catch (err) {
    if (err instanceof ApiError && !silent) {
      wx.showToast({ title: getErrorMessage(err.code), icon: 'none', duration: 2000 });
    }
    throw err;
  }
}
