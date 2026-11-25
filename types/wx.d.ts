// 微信小程序全局对象 wx 的最小类型声明（仅覆盖本单用到的 API）。
// 真机上 wx 由微信客户端提供；Node 测试环境下由测试 mock 注入。

export interface WxRequestSuccessResult {
  data: unknown;
  statusCode: number;
  header: Record<string, string>;
}

export interface WxRequestFailResult {
  errMsg: string;
}

export interface WxRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  dataType?: string;
  success?: (res: WxRequestSuccessResult) => void;
  fail?: (err: WxRequestFailResult) => void;
}

export interface WxUploadFileSuccessResult {
  data: string;
  statusCode: number;
}

export interface WxUploadFileOptions {
  url: string;
  filePath: string;
  name: string;
  header?: Record<string, string>;
  formData?: Record<string, string>;
  timeout?: number;
  success?: (res: WxUploadFileSuccessResult) => void;
  fail?: (err: WxRequestFailResult) => void;
}

export interface WxShowToastOptions {
  title: string;
  icon?: 'success' | 'error' | 'loading' | 'none';
  duration?: number;
}

export interface MiniProgramInfo {
  envVersion: 'develop' | 'trial' | 'release';
}

declare global {
  var wx: {
    request: (options: WxRequestOptions) => void;
    uploadFile: (options: WxUploadFileOptions) => void;
    showToast: (options: WxShowToastOptions) => void;
    reLaunch: (options: { url: string }) => void;
    getAccountInfoSync: () => { miniProgram: MiniProgramInfo };
  };
}

export {};
