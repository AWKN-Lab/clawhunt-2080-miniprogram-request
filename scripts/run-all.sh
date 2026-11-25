#!/usr/bin/env bash
# 一键复跑：npm ci → lint → typecheck → test → build。
# 任一步失败即退出非 0。输出应存入 evidence/run-all.log（调用方 tee）。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== npm ci =="
npm ci
echo "== lint =="
npm run lint
echo "== typecheck =="
npm run typecheck
echo "== test =="
npm test
echo "== build =="
npm run build
echo "== 全部通过 =="
