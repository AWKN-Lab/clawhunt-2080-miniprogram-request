// upload.ts 单元测试：鉴权头、超时、业务错误、silent。

import * as auth from '../services/auth';
import { ApiError } from '../services/request';
import { upload } from '../services/upload';
import { enqueueUpload, installWxMock } from './wx-mock';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('upload()', () => {
  const calls = installWxMock();

  beforeEach(() => {
    installWxMock();
    auth.setToken('demo-token-abc123');
    jest.restoreAllMocks();
  });

  afterEach(() => {
    auth.setToken(null);
  });

  test('成功上传：返回 data，注入鉴权头与 X-Request-Id，formData 带 scene', async () => {
    enqueueUpload({
      type: 'success',
      statusCode: 200,
      data: JSON.stringify({ code: 0, message: 'ok', data: { url: 'https://cdn.example.invalid/a.png' } }),
    });
    const result = await upload<{ url: string }>('wxfile://tmp_abc.png', 'avatar');
    expect(result).toEqual({ url: 'https://cdn.example.invalid/a.png' });
    expect(calls.uploads).toHaveLength(1);
    const call = calls.uploads[0];
    expect(call.url).toBe('https://dev-api.example.invalid/upload');
    expect(call.header?.Authorization).toBe('Bearer demo-token-abc123');
    expect(call.header?.['X-Request-Id']).toMatch(UUID_V4_RE);
    expect(call.formData).toEqual({ scene: 'avatar' });
    expect(call.timeout).toBe(10000);
  });

  test('业务错误抛 ApiError', async () => {
    enqueueUpload({
      type: 'success',
      statusCode: 200,
      data: JSON.stringify({ code: 40002, message: '文件格式不支持', data: null }),
    });
    await expect(upload('wxfile://tmp_abc.png', 'avatar')).rejects.toMatchObject({
      code: 40002,
      message: '文件格式不支持',
    });
  });

  test('超时抛 TIMEOUT', async () => {
    enqueueUpload({ type: 'fail', errMsg: 'uploadFile:fail timeout' });
    await expect(upload('wxfile://tmp_abc.png', 'avatar')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  test('网络错误抛 NETWORK', async () => {
    enqueueUpload({ type: 'fail', errMsg: 'uploadFile:fail' });
    await expect(upload('wxfile://tmp_abc.png', 'avatar')).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  test('silent=true 时不自动 toast', async () => {
    enqueueUpload({
      type: 'success',
      statusCode: 200,
      data: JSON.stringify({ code: 40002, message: '文件格式不支持', data: null }),
    });
    await expect(upload('wxfile://tmp_abc.png', 'avatar', { silent: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(calls.toastCalls).toHaveLength(0);
  });

  test('未登录时不附加 Authorization', async () => {
    auth.setToken(null);
    enqueueUpload({
      type: 'success',
      statusCode: 200,
      data: JSON.stringify({ code: 0, message: 'ok', data: { url: 'x' } }),
    });
    await upload('wxfile://tmp_abc.png', 'avatar');
    expect(calls.uploads[0].header?.Authorization).toBeUndefined();
    expect(calls.uploads[0].header?.['X-Request-Id']).toMatch(UUID_V4_RE);
  });
});
