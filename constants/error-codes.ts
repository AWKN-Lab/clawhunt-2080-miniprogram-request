// 错误码到中文提示的映射表。
// 键为业务 code 或 HTTP 状态码（字符串形式）；TIMEOUT / NETWORK 为本地错误码。
// 每条都有中文提示，供 request.ts 在非 silent 模式下自动 toast。

export const ERROR_MESSAGES: Record<string, string> = {
  '400': '请求参数有误，请检查后重试。',
  '401': '登录已过期，请重新登录。',
  '403': '没有权限执行该操作。',
  '404': '请求的资源不存在。',
  '405': '请求方法不被允许。',
  '408': '请求超时，请稍后重试。',
  '409': '数据冲突，请刷新后重试。',
  '413': '上传内容过大，请压缩后重试。',
  '422': '提交内容不符合要求，请检查后重试。',
  '429': '操作太频繁，请稍后再试。',
  '500': '服务器开小差了，请稍后重试。',
  '502': '网关异常，请稍后重试。',
  '503': '服务暂时不可用，请稍后重试。',
  '504': '网关超时，请稍后重试。',
  NETWORK: '网络断开，请检查网络后重试。',
  TIMEOUT: '请求超时，请稍后重试。',
  UNKNOWN: '未知错误，请稍后重试。',
};

export const ERROR_CODE_KEYS: string[] = Object.keys(ERROR_MESSAGES);

/** 按错误码取中文提示；未登记的码返回通用提示。 */
export function getErrorMessage(code: string | number): string {
  const key = String(code);
  return ERROR_MESSAGES[key] || ERROR_MESSAGES.UNKNOWN;
}
