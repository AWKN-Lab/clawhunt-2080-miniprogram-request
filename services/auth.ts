// 登录模块桩（本单先用桩函数，真实实现见 README 对接点）。
// 职责：token 存取、重新登录、清除登录态、回到首页。
// 真实实现替换本文件即可，request.ts / upload.ts 只依赖这四个导出。

let token: string | null = null;

/** 测试 / 登录流程用：写入 token。真实实现改为从登录接口返回后写入。 */
export function setToken(next: string | null): void {
  token = next;
}

/** 取当前 token；未登录时返回 null（request.ts 此时不附加 Authorization）。 */
export function getToken(): string | null {
  return token;
}

/** 重新登录：本单为桩，真实实现应调 wx.login + 后端换 token 后 setToken。 */
export async function relogin(): Promise<void> {
  // 桩：默认直接成功；测试可 jest.spyOn 计数或改写行为。
  return Promise.resolve();
}

/** 清除登录态：清 token。 */
export function clearLogin(): void {
  token = null;
}

/** 回到首页：真机调 wx.reLaunch。 */
export function goHome(): void {
  wx.reLaunch({ url: '/pages/index/index' });
}
