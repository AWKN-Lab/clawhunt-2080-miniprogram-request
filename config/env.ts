// 环境配置：按 envVersion（develop / trial / release）取 baseURL。
// 真机上 envVersion 来自 wx.getAccountInfoSync()；Node 测试环境下
// 可用环境变量 MINI_PROGRAM_ENV 覆盖，或调用 setEnvVersion() 注入。
// 以下域名均为虚构占位（.example.invalid），对接真实后端时替换为真实地址。

export type EnvVersion = 'develop' | 'trial' | 'release';

const BASE_URLS: Record<EnvVersion, string> = {
  develop: 'https://dev-api.example.invalid',
  trial: 'https://trial-api.example.invalid',
  release: 'https://api.example.invalid',
};

let envVersionOverride: EnvVersion | null = null;

/** 测试 / 调试用：强制指定当前环境版本。传 null 恢复自动读取。 */
export function setEnvVersion(version: EnvVersion | null): void {
  envVersionOverride = version;
}

export function getEnvVersion(): EnvVersion {
  if (envVersionOverride) {
    return envVersionOverride;
  }
  const fromEnv = process.env.MINI_PROGRAM_ENV;
  if (fromEnv === 'develop' || fromEnv === 'trial' || fromEnv === 'release') {
    return fromEnv;
  }
  try {
    const info = wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.envVersion;
    if (v === 'develop' || v === 'trial' || v === 'release') {
      return v;
    }
  } catch {
    // 非小程序环境（如 Node 测试）：忽略，走默认 develop。
  }
  return 'develop';
}

export function getBaseURL(): string {
  return BASE_URLS[getEnvVersion()];
}
