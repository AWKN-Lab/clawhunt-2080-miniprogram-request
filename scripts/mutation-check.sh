#!/usr/bin/env bash
# 变异自证：两处真实行为变异各跑一遍，测试必须变红，还原后全绿。
# 硬门禁（GPT 复核 P1-3 整改）：
# - 变异 A、B 任一退出 0，脚本立即失败（不再只记录退出码）；
# - 还原后全套测试必须退出 0，否则失败；
# - 原始源码 services/request.ts 全程不得被修改（变异只在 /tmp 副本上做，
#   脚本开始与结束各校验一次 SHA256，不一致即失败）。
# 原始输出原样存入 evidence/mutation-check-20261125-fix.log，一个字不改写；
# 旧日志 evidence/mutation-check.log 保留为历史，本脚本不动它。
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="evidence/mutation-check-20261125-fix.log"
rm -f "$LOG"

# 记原始源码摘要：脚本结束时必须一致，否则失败。
ORIG_SHA="$(sha256sum services/request.ts | awk '{print $1}')"
echo "原始 services/request.ts SHA256：$ORIG_SHA" | tee -a "$LOG"

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
  echo "$code" > /tmp/mut2080-last-code.txt
}

fail() {
  echo "变异自证失败：$1" | tee -a "$LOG"
  rm -rf /tmp/mut2080a /tmp/mut2080b /tmp/mut2080-last-code.txt
  exit 1
}

check_pristine() {
  local now
  now="$(sha256sum services/request.ts | awk '{print $1}')"
  if [ "$now" != "$ORIG_SHA" ]; then
    fail "原始 services/request.ts 被修改（$ORIG_SHA → $now）"
  fi
  echo "原始源码校验通过：services/request.ts SHA256 与脚本开始时一致" | tee -a "$LOG"
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
grep -q "MAX_RETRIES = 1" /tmp/mut2080a/services/request.ts || fail "变异 A 未生效：MAX_RETRIES 未改成 1"
grep -n "MAX_RETRIES =" /tmp/mut2080a/services/request.ts | tee -a "$LOG"
run_suite_in_copy "变异 A：MAX_RETRIES 2 → 1（GET 5xx 重试次数改少）" /tmp/mut2080a
CODE_A="$(cat /tmp/mut2080-last-code.txt)"
[ "$CODE_A" != "0" ] || fail "变异 A 未变红（退出 0），测试未捕获该变异"

# 变异 B：401 重放去掉（relogin 后不再重放，第二次请求永不发生，测试须变红）。
make_copy /tmp/mut2080b
sed -i 's/if (!replayed) {/if (false) { \/\/ 变异：401 不重放/' /tmp/mut2080b/services/request.ts
grep -q "变异：401 不重放" /tmp/mut2080b/services/request.ts || fail "变异 B 未生效：401 重放未去掉"
grep -n "变异：401 不重放" /tmp/mut2080b/services/request.ts | tee -a "$LOG"
run_suite_in_copy "变异 B：401 重放去掉（第一次 401 后直接清登录态）" /tmp/mut2080b
CODE_B="$(cat /tmp/mut2080-last-code.txt)"
[ "$CODE_B" != "0" ] || fail "变异 B 未变红（退出 0），测试未捕获该变异"

rm -rf /tmp/mut2080a /tmp/mut2080b /tmp/mut2080-last-code.txt

# 变异跑完后先校验原始源码未被修改。
check_pristine

# 还原后全套测试（原仓库，必须绿）。
echo "== 还原后全套测试（必须绿）==" | tee -a "$LOG"
npx jest --ci 2>&1 | tee -a "$LOG"
RESTORE_CODE="${PIPESTATUS[0]}"
echo "还原后退出码：$RESTORE_CODE" | tee -a "$LOG"
[ "$RESTORE_CODE" = "0" ] || fail "还原后测试未全绿（退出 $RESTORE_CODE）"
check_pristine
echo "== 变异自证通过：两处变异均变红，还原后全绿，原始源码未被修改 ==" | tee -a "$LOG"
