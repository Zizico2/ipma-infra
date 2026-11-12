#!/bin/sh
set -eu
PORT="${PORT:-8080}"
case "${PORT:-8080}" in
  ''|*[!0-9]*) echo 'PORT must be numeric' >&2; exit 64 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo 'PORT must be in 1..65535' >&2; exit 64
fi
case "$IPMA_SERVICE" in
  ipma-proxy) export IPMA_PROXY_LISTEN_ADDR="${IPMA_PROXY_LISTEN_ADDR:-0.0.0.0:$PORT}" ;;
  ipma-gateway) export IPMA_GATEWAY_LISTEN_ADDR="${IPMA_GATEWAY_LISTEN_ADDR:-0.0.0.0:$PORT}" ;;
  ipma-public-data-proxy) export IPMA_PUBLIC_DATA_PROXY_LISTEN_ADDR="${IPMA_PUBLIC_DATA_PROXY_LISTEN_ADDR:-0.0.0.0:$PORT}" ;;
  ipma-public-data-gateway) export IPMA_PUBLIC_DATA_GATEWAY_LISTEN_ADDR="${IPMA_PUBLIC_DATA_GATEWAY_LISTEN_ADDR:-0.0.0.0:$PORT}" ;;
  *) echo 'Unknown IPMA_SERVICE' >&2; exit 64 ;;
esac
exec /usr/local/bin/service "$@"
