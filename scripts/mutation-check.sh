#!/usr/bin/env bash
# 变异自证：两处真实行为变异各跑一遍，测试必须变红，还原后全绿。
# 变异只在 /tmp 副本上做，原仓库文件不动；原始输出原样存入 evidence/mutation-check.log，一个字不改写。
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="evidence/mutation-check.log"
rm -f "$LOG"

run_suite_in_copy() {
  local name="$1"
  local dir="$2"
  echo "== $name ==" | tee -a "$LOG"
  (cd "$dir" && npx jest --ci > /tmp/mut2080-out.txt 2>&1; echo "$?" > /tmp/mut2080-code.txt)
  cat /tmp/mut2080-out.txt | tee -a "$LOG"
  local code
  code="$(cat /tmp/mut2080-code.txt)"
  echo "$name 退出码：$code" | tee -a "$LOG"
  echo "" | tee -a "$LOG"
  rm -f /tmp/mut2080-out.txt /tmp/mut2080-code.txt
}

make_copy() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  cp -r services constants config types __tests__ package.json package-lock.json jest.config.js tsconfig.json eslint.config.mjs "$dir/"
  ln -s "$PWD/node_modules" "$dir/node_modules"
}

# 变异 A：MAX_RETRIES 2 改成 1（GET 5xx 应只重试 1 次，测试须变红）。
make_copy /tmp/mut2080a
sed -i 's/export const MAX_RETRIES = 2;/export const MAX_RETRIES = 1;/' /tmp/mut2080a/services/request.ts
grep -n "MAX_RETRIES =" /tmp/mut2080a/services/request.ts | tee -a "$LOG"
run_suite_in_copy "变异 A：MAX_RETRIES 2 → 1（GET 5xx 重试次数改少）" /tmp/mut2080a

# 变异 B：401 重放去掉（relogin 后不再重放，第二次请求永不发生，测试须变红）。
make_copy /tmp/mut2080b
sed -i 's/if (!replayed) {/if (false) { \/\/ 变异：401 不重放/' /tmp/mut2080b/services/request.ts
grep -n "变异：401 不重放" /tmp/mut2080b/services/request.ts | tee -a "$LOG"
run_suite_in_copy "变异 B：401 重放去掉（第一次 401 后直接清登录态）" /tmp/mut2080b

rm -rf /tmp/mut2080a /tmp/mut2080b

# 还原后全套测试（原仓库，必须绿）。
echo "== 还原后全套测试（必须绿）==" | tee -a "$LOG"
npx jest --ci 2>&1 | tee -a "$LOG"
echo "还原后退出码：${PIPESTATUS[0]}" | tee -a "$LOG"
echo "== 变异自证通过：两处变异均变红，还原后全绿 ==" | tee -a "$LOG"
