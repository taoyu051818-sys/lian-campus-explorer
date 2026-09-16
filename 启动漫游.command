#!/bin/zsh
cd -- "$(dirname "$0")/dist" || exit 1
printf "请在浏览器打开 http://127.0.0.1:5175/\n关闭此终端窗口会停止预览。\n"
python3 -m http.server 5175 --bind 127.0.0.1
