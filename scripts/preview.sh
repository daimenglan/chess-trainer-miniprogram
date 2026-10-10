#!/usr/bin/env bash
# 编译小程序并生成预览二维码。
# 用法： bash scripts/preview.sh [备注]
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

CLI="/c/Program Files (x86)/Tencent/微信web开发者工具/cli.bat"
if [ ! -f "$CLI" ]; then
  echo "找不到微信开发者工具 CLI：$CLI" >&2
  exit 1
fi

echo "==> 编译 TypeScript"
npx tsc -p tsconfig.json

echo "==> 生成预览二维码"
"$CLI" preview \
  --project "$PROJECT_DIR" \
  --qr-format image \
  --qr-output "$PROJECT_DIR/.preview-qr.png" \
  --info-output "$PROJECT_DIR/.preview-info.json"

echo ""
echo "预览二维码：$PROJECT_DIR/.preview-qr.png"
echo "用微信「扫一扫」扫码即可在手机上打开调试版"
