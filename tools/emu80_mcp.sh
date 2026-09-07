#!/bin/sh
# Вызов инструмента Emu80-MCP без регистрации клиента: mcp.sh <tool> '<json-аргументы>' [порт]
P=${3:-19781}
curl -s -X POST "http://127.0.0.1:$P/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":${2:-\{\}}}}"
