// error-codes.ts 单元测试：覆盖 AC3。

import { ERROR_CODE_KEYS, ERROR_MESSAGES, getErrorMessage } from '../constants/error-codes';

describe('error-codes', () => {
  test('AC3 至少包含 8 个错误码条目，且每条都有中文提示', () => {
    expect(ERROR_CODE_KEYS.length).toBeGreaterThanOrEqual(8);
    for (const key of ERROR_CODE_KEYS) {
      const message = ERROR_MESSAGES[key];
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      // 中文提示：至少含一个汉字
      expect(/[\u4e00-\u9fa5]/.test(message)).toBe(true);
    }
  });

  test('AC3 订单要求的 8 个码全覆盖：401、403、404、409、422、429、500 与网络断开', () => {
    for (const key of ['401', '403', '404', '409', '422', '429', '500', 'NETWORK']) {
      expect(ERROR_MESSAGES[key]).toBeDefined();
      expect(ERROR_MESSAGES[key].length).toBeGreaterThan(0);
    }
    expect(ERROR_MESSAGES['401']).toBe('登录已过期，请重新登录。');
    expect(ERROR_MESSAGES['403']).toBe('没有权限执行该操作。');
    expect(ERROR_MESSAGES['404']).toBe('请求的资源不存在。');
    expect(ERROR_MESSAGES['409']).toBe('数据冲突，请刷新后重试。');
    expect(ERROR_MESSAGES['422']).toBe('提交内容不符合要求，请检查后重试。');
    expect(ERROR_MESSAGES['429']).toBe('操作太频繁，请稍后再试。');
    expect(ERROR_MESSAGES['500']).toBe('服务器开小差了，请稍后重试。');
    expect(ERROR_MESSAGES.NETWORK).toBe('网络断开，请检查网络后重试。');
  });

  test('未登记的码返回通用提示', () => {
    expect(getErrorMessage(99999)).toBe('未知错误，请稍后重试。');
    expect(getErrorMessage('TIMEOUT')).toBe('请求超时，请稍后重试。');
  });
});
