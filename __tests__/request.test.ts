// request.ts 单元测试：逐项覆盖 AC1–AC4。
// 全部用 wx-mock 注入行为；退避等待用可注入延时函数记录毫秒数，不真睡。

import { setEnvVersion } from '../config/env';
import * as auth from '../services/auth';
import {
  ApiError,
  __resetDelayImpl,
  __setDelayImpl,
  request,
} from '../services/request';
import { enqueueRequest, installWxMock } from './wx-mock';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('request()', () => {
  const calls = installWxMock();
  let delays: number[] = [];

  beforeEach(() => {
    installWxMock();
    delays = [];
    __setDelayImpl(async (ms: number) => {
      delays.push(ms);
    });
    auth.setToken('demo-token-abc123');
    setEnvVersion('develop');
    jest.restoreAllMocks();
  });

  afterEach(() => {
    __resetDelayImpl();
    setEnvVersion(null);
    auth.setToken(null);
  });

  test('AC1 成功解包：code=0 时返回 data', async () => {
    enqueueRequest({
      type: 'success',
      statusCode: 200,
      data: { code: 0, message: 'ok', data: { id: 42, name: '演示空间' } },
    });
    const result = await request<{ id: number; name: string }>({
      url: '/spaces/42',
    });
    expect(result).toEqual({ id: 42, name: '演示空间' });
    expect(calls.requests).toHaveLength(1);
    expect(calls.requests[0].url).toBe('https://dev-api.example.invalid/spaces/42');
  });

  test('AC1 业务错误抛出 ApiError（含 code、message、request_id）', async () => {
    enqueueRequest({
      type: 'success',
      statusCode: 200,
      data: { code: 40001, message: '业务校验失败', data: null },
    });
    let caught: unknown;
    try {
      await request({ url: '/spaces' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ code: 40001, message: '业务校验失败' });
    expect((caught as ApiError).requestId).toMatch(UUID_V4_RE);
    expect(calls.toastCalls).toHaveLength(1);
  });

  test('AC1 401 重放一次：第一次 401 → relogin → 重放成功', async () => {
    const reloginSpy = jest.spyOn(auth, 'relogin');
    enqueueRequest({ type: 'success', statusCode: 401, data: { code: 401, message: '登录已过期', data: null } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: { ok: true } } });
    const result = await request<{ ok: boolean }>({ url: '/spaces' });
    expect(result).toEqual({ ok: true });
    expect(reloginSpy).toHaveBeenCalledTimes(1);
    expect(calls.requests).toHaveLength(2);
    expect(calls.toastCalls).toHaveLength(0);
  });

  test('AC1 401 第二次仍 401：清登录态并回首页', async () => {
    const reloginSpy = jest.spyOn(auth, 'relogin');
    const clearSpy = jest.spyOn(auth, 'clearLogin');
    const goHomeSpy = jest.spyOn(auth, 'goHome');
    enqueueRequest({ type: 'success', statusCode: 401, data: { code: 401, message: '登录已过期', data: null } });
    enqueueRequest({ type: 'success', statusCode: 401, data: { code: 401, message: '登录已过期', data: null } });
    await expect(request({ url: '/spaces' })).rejects.toMatchObject({ code: 401 });
    expect(reloginSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(goHomeSpy).toHaveBeenCalledTimes(1);
    expect(auth.getToken()).toBeNull();
    expect(calls.relaunchCalls).toEqual([{ url: '/pages/index/index' }]);
  });

  test('AC1 GET 遇 5xx 重试 2 次（共 3 次请求，退避 500ms、1500ms）', async () => {
    enqueueRequest({ type: 'success', statusCode: 500, data: { code: 500, message: '服务器开小差了', data: null } });
    enqueueRequest({ type: 'success', statusCode: 502, data: { code: 502, message: '网关异常', data: null } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: { n: 1 } } });
    const result = await request<{ n: number }>({ url: '/spaces', method: 'GET' });
    expect(result).toEqual({ n: 1 });
    expect(calls.requests).toHaveLength(3);
    expect(delays).toEqual([500, 1500]);
  });

  test('AC1 GET 遇网络错误重试 2 次后成功', async () => {
    enqueueRequest({ type: 'fail', errMsg: 'request:fail' });
    enqueueRequest({ type: 'fail', errMsg: 'request:fail' });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 'ok' } });
    const result = await request<string>({ url: '/spaces', method: 'GET' });
    expect(result).toBe('ok');
    expect(calls.requests).toHaveLength(3);
    expect(delays).toEqual([500, 1500]);
  });

  test('AC1 POST 遇 5xx 不重试', async () => {
    enqueueRequest({ type: 'success', statusCode: 500, data: { code: 500, message: '服务器开小差了', data: null } });
    await expect(
      request({ url: '/spaces', method: 'POST', data: { name: '演示空间' } }),
    ).rejects.toMatchObject({ code: 500 });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 POST 遇网络错误不重试', async () => {
    enqueueRequest({ type: 'fail', errMsg: 'request:fail' });
    await expect(
      request({ url: '/spaces', method: 'POST', data: { name: '演示空间' } }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC2 超时抛出的错误 code 为 TIMEOUT（GET 也不重试）', async () => {
    enqueueRequest({ type: 'fail', errMsg: 'request:fail timeout' });
    await expect(request({ url: '/spaces', method: 'GET' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(calls.toastCalls[0].title).toBe('请求超时，请稍后重试。');
  });

  test('AC4 请求头同时含 Authorization 与 X-Request-Id（UUID v4，两次请求 ID 不同）', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 1 } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 2 } });
    await request({ url: '/a' });
    await request({ url: '/b' });
    const h1 = calls.requests[0].header || {};
    const h2 = calls.requests[1].header || {};
    expect(h1.Authorization).toBe('Bearer demo-token-abc123');
    expect(h1['X-Request-Id']).toMatch(UUID_V4_RE);
    expect(h2['X-Request-Id']).toMatch(UUID_V4_RE);
    expect(h1['X-Request-Id']).not.toBe(h2['X-Request-Id']);
  });

  test('AC4 调用方传入 X-Request-Id 会被自动生成的 UUID 覆盖', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 1 } });
    await request({ url: '/a', header: { 'X-Request-Id': 'caller-id' } });
    const header = calls.requests[0].header || {};
    expect(header['X-Request-Id']).toMatch(UUID_V4_RE);
    expect(header['X-Request-Id']).not.toBe('caller-id');
  });

  test('AC1 HTTP 200 + 业务 code 500 不重试（业务码不参与重试决策）', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 500, message: '服务器开小差了', data: null } });
    await expect(request({ url: '/spaces', method: 'GET' })).rejects.toMatchObject({ code: 500 });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 HTTP 200 + 业务 code NETWORK 不重试（业务码不参与重试决策）', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 'NETWORK', message: '网络异常', data: null } });
    await expect(request({ url: '/spaces', method: 'GET' })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 HTTP 503 + 业务 code 0 仍重试 2 次', async () => {
    enqueueRequest({ type: 'success', statusCode: 503, data: { code: 0, message: 'ok', data: null } });
    enqueueRequest({ type: 'success', statusCode: 503, data: { code: 0, message: 'ok', data: null } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: { n: 1 } } });
    const result = await request<{ n: number }>({ url: '/spaces', method: 'GET' });
    expect(result).toEqual({ n: 1 });
    expect(calls.requests).toHaveLength(3);
    expect(delays).toEqual([500, 1500]);
  });

  test('AC1 HTTP 503 + 业务 code 为字符串仍重试 2 次', async () => {
    enqueueRequest({ type: 'success', statusCode: 503, data: { code: 'ERR_GATEWAY', message: '网关异常', data: null } });
    enqueueRequest({ type: 'success', statusCode: 503, data: { code: 'ERR_GATEWAY', message: '网关异常', data: null } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: { n: 1 } } });
    const result = await request<{ n: number }>({ url: '/spaces', method: 'GET' });
    expect(result).toEqual({ n: 1 });
    expect(calls.requests).toHaveLength(3);
    expect(delays).toEqual([500, 1500]);
  });

  test('AC1 PUT 遇 5xx 不重试', async () => {
    enqueueRequest({ type: 'success', statusCode: 500, data: { code: 500, message: '服务器开小差了', data: null } });
    await expect(
      request({ url: '/spaces', method: 'PUT', data: { name: '演示空间' } }),
    ).rejects.toMatchObject({ code: 500 });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 PUT 遇网络错误不重试', async () => {
    enqueueRequest({ type: 'fail', errMsg: 'request:fail' });
    await expect(
      request({ url: '/spaces', method: 'PUT', data: { name: '演示空间' } }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 DELETE 遇 5xx 不重试', async () => {
    enqueueRequest({ type: 'success', statusCode: 502, data: { code: 502, message: '网关异常', data: null } });
    await expect(request({ url: '/spaces/42', method: 'DELETE' })).rejects.toMatchObject({ code: 502 });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('AC1 DELETE 遇网络错误不重试', async () => {
    enqueueRequest({ type: 'fail', errMsg: 'request:fail' });
    await expect(request({ url: '/spaces/42', method: 'DELETE' })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls.requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  test('未登录时不附加 Authorization，但仍有 X-Request-Id', async () => {
    auth.setToken(null);
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 1 } });
    await request({ url: '/a' });
    const header = calls.requests[0].header || {};
    expect(header.Authorization).toBeUndefined();
    expect(header['X-Request-Id']).toMatch(UUID_V4_RE);
  });

  test('silent=true 时不自动 toast', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 40001, message: '业务校验失败', data: null } });
    await expect(request({ url: '/spaces', silent: true })).rejects.toBeInstanceOf(ApiError);
    expect(calls.toastCalls).toHaveLength(0);
  });

  test('403 提示中文原文且 toast', async () => {
    enqueueRequest({ type: 'success', statusCode: 403, data: { code: 403, message: '没有权限', data: null } });
    await expect(request({ url: '/spaces' })).rejects.toMatchObject({ code: 403 });
    expect(calls.toastCalls[0].title).toBe('没有权限执行该操作。');
  });

  test('默认超时 10s，可用 timeout 覆盖', async () => {
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 1 } });
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 2 } });
    await request({ url: '/a' });
    await request({ url: '/b', timeout: 5000 });
    expect(calls.requests[0].timeout).toBe(10000);
    expect(calls.requests[1].timeout).toBe(5000);
  });

  test('baseURL 按 envVersion 切换', async () => {
    setEnvVersion('trial');
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 1 } });
    await request({ url: '/a' });
    expect(calls.requests[0].url).toBe('https://trial-api.example.invalid/a');

    setEnvVersion('release');
    enqueueRequest({ type: 'success', statusCode: 200, data: { code: 0, message: 'ok', data: 2 } });
    await request({ url: '/b' });
    expect(calls.requests[1].url).toBe('https://api.example.invalid/b');
  });
});
