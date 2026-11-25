// wx 全局对象 mock：测试里可控 wx.request / wx.uploadFile / wx.showToast / wx.reLaunch。
// 行为用队列注入：每个 enqueue 对应一次调用，按顺序消费，便于断言重试与 401 重放。

import type {
  WxRequestOptions,
  WxRequestSuccessResult,
  WxUploadFileOptions,
} from '../types/wx';

export type RequestBehavior =
  | { type: 'success'; statusCode: number; data: unknown }
  | { type: 'fail'; errMsg: string };

export type UploadBehavior =
  | { type: 'success'; statusCode: number; data: string }
  | { type: 'fail'; errMsg: string };

export interface WxMockCalls {
  requests: WxRequestOptions[];
  uploads: WxUploadFileOptions[];
  toastCalls: { title: string; icon?: string }[];
  relaunchCalls: { url: string }[];
}

const requestQueue: RequestBehavior[] = [];
const uploadQueue: UploadBehavior[] = [];
const calls: WxMockCalls = { requests: [], uploads: [], toastCalls: [], relaunchCalls: [] };

export function enqueueRequest(behavior: RequestBehavior): void {
  requestQueue.push(behavior);
}

export function enqueueUpload(behavior: UploadBehavior): void {
  uploadQueue.push(behavior);
}

export function resetWxMock(): void {
  requestQueue.length = 0;
  uploadQueue.length = 0;
  calls.requests.length = 0;
  calls.uploads.length = 0;
  calls.toastCalls.length = 0;
  calls.relaunchCalls.length = 0;
}

export function installWxMock(): WxMockCalls {
  resetWxMock();
  globalThis.wx = {
    request: (opts: WxRequestOptions) => {
      calls.requests.push(opts);
      const behavior = requestQueue.shift();
      if (!behavior) {
        throw new Error('wx.request 被调用，但行为队列为空');
      }
      if (behavior.type === 'success') {
        const result: WxRequestSuccessResult = {
          data: behavior.data,
          statusCode: behavior.statusCode,
          header: {},
        };
        opts.success?.(result);
      } else {
        opts.fail?.({ errMsg: behavior.errMsg });
      }
    },
    uploadFile: (opts: WxUploadFileOptions) => {
      calls.uploads.push(opts);
      const behavior = uploadQueue.shift();
      if (!behavior) {
        throw new Error('wx.uploadFile 被调用，但行为队列为空');
      }
      if (behavior.type === 'success') {
        opts.success?.({ data: behavior.data, statusCode: behavior.statusCode });
      } else {
        opts.fail?.({ errMsg: behavior.errMsg });
      }
    },
    showToast: (opts: { title: string; icon?: string }) => {
      calls.toastCalls.push({ title: opts.title, icon: opts.icon });
    },
    reLaunch: (opts: { url: string }) => {
      calls.relaunchCalls.push({ url: opts.url });
    },
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' as const } }),
  };
  return calls;
}
