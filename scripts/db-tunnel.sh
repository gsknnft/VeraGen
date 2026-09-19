#!/usr/bin/env bash
# Local development access to the droplet's Postgres, which listens on
# loopback only and is never exposed publicly. Forwards 127.0.0.1:5433 here
# to 127.0.0.1:5432 there, and reconnects when the link drops (a Wi-Fi blip
# otherwise kills the tunnel silently and every query starts failing).
#
#   pnpm db:tunnel        # leave running while you develop
#
# DATABASE_URL then points at ...@127.0.0.1:5433/veragen_db.
HOST="${DB_TUNNEL_HOST:-droplet}"
while true; do
  echo "[db-tunnel] connecting to $HOST (local 5433 -> remote 5432)…"
  ssh -o BatchMode=yes -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
      -N -L 5433:127.0.0.1:5432 "$HOST"
  echo "[db-tunnel] disconnected (exit $?); retrying in 3s. Ctrl+C to stop."
  sleep 3
done
