#!/usr/bin/env bash
# Standaard deployment: ./scripts/deploy.sh <test|demo|production> [command] [--reset] [--no-checks]
#
# Commando's:
#   deploy  (standaard) controleren, bouwen, starten en verifieren
#   down    containers van de omgeving stoppen en verwijderen
#   status  containerstatus tonen
#   logs    logs volgen
#   caddy   alleen de Caddy site config installeren en herladen (production)
#
# Opties --caddy / --no-caddy forceren of slaan de Caddy-stap over. Caddy draait als
# aparte, centraal beheerde instantie (docker-netwerk caddy-net). De site config
# caddy/conf.d/tracker.setbaas.nl.caddy wordt naar de conf.d van die instantie
# gekopieerd, gevalideerd en herladen (bij fouten terugdraaien). Instelbaar in .env.production:
#   CADDY_CONF_DIR (standaard $HOME/apps/caddy/conf.d), CADDY_CONTAINER (autodetect),
#   CADDY_CONFIG_PATH (standaard /etc/caddy/Caddyfile)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENVIRONMENT="${1:-}"
shift || true
COMMAND=deploy
case "${1:-}" in
  deploy|down|status|logs|caddy) COMMAND="$1"; shift ;;
esac
RESET=false
DO_CADDY=true
FORCE_CADDY=false
CHECKS=true
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    --no-checks) CHECKS=false ;;
    --caddy) FORCE_CADDY=true ;;
    --no-caddy) DO_CADDY=false ;;
    *) echo "Onbekende optie of commando: $arg" >&2; exit 2 ;;
  esac
done

case "$ENVIRONMENT" in
  test) COMPOSE_FILE=docker-compose.yml; PB_PORT=8191; FRONTEND_PORT=3100; SEED_DEMO=true ;;
  demo) COMPOSE_FILE=docker-compose.yml; PB_PORT=8291; FRONTEND_PORT=3200; SEED_DEMO=true ;;
  production|prod) ENVIRONMENT=production; COMPOSE_FILE=docker-compose.prod.yml; SEED_DEMO=false ;;
  *) echo "Gebruik: $0 <test|demo|production> [deploy|down|status|logs|caddy] [--reset] [--no-checks]" >&2; exit 2 ;;
esac

ENV_FILE=".env.$ENVIRONMENT"
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE ontbreekt. Kopieer .env.example en vul de waarden in." >&2; exit 1; }

PROJECT="top-trainer-$ENVIRONMENT"
export PB_DATA_DIR="$ROOT/pb_data_$ENVIRONMENT"
export SEED_DEMO
[ "$ENVIRONMENT" = production ] || export PB_PORT FRONTEND_PORT

CADDY_SITE_FILE="caddy/conf.d/tracker.setbaas.nl.caddy"
CADDY_CONF_DIR="${CADDY_CONF_DIR:-$HOME/apps/caddy/conf.d}"
CADDY_CONTAINER="${CADDY_CONTAINER:-}"
CADDY_CONFIG_PATH="${CADDY_CONFIG_PATH:-/etc/caddy/Caddyfile}"

deploy_caddy() {
  [ "$ENVIRONMENT" = production ] || { echo "Geen Caddy site config voor $ENVIRONMENT, overgeslagen"; return 0; }
  local src="$ROOT/$CADDY_SITE_FILE" dest container backup=""
  [ -f "$src" ] || { echo "Caddy site config ontbreekt: $CADDY_SITE_FILE" >&2; return 1; }
  [ -d "$CADDY_CONF_DIR" ] || { echo "Caddy conf.d map niet gevonden: $CADDY_CONF_DIR (zet CADDY_CONF_DIR of gebruik --no-caddy)" >&2; return 1; }
  dest="$CADDY_CONF_DIR/$(basename "$src")"
  if [ "$FORCE_CADDY" != true ] && cmp -s "$src" "$dest"; then
    echo "Caddy config is al up-to-date"; return 0
  fi
  container="$CADDY_CONTAINER"
  [ -n "$container" ] || container="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /(^|\/)caddy(:|$)/ {print $1; exit}')"
  [ -n "$container" ] || { echo "Geen draaiende Caddy container gevonden (zet CADDY_CONTAINER of gebruik --no-caddy)" >&2; return 1; }
  if [ -f "$dest" ]; then backup="$dest.bak-$(date -u +%Y%m%d%H%M%S)"; cp "$dest" "$backup"; fi
  cp "$src" "$dest"
  if ! docker exec "$container" caddy validate --adapter caddyfile --config "$CADDY_CONFIG_PATH" >/dev/null 2>&1 \
     || ! docker exec "$container" caddy reload --config "$CADDY_CONFIG_PATH" >/dev/null 2>&1; then
    if [ -n "$backup" ]; then mv "$backup" "$dest"; else rm -f "$dest"; fi
    docker exec "$container" caddy reload --config "$CADDY_CONFIG_PATH" >/dev/null 2>&1 || true
    echo "Caddy config ongeldig of reload mislukt; vorige versie hersteld" >&2
    return 1
  fi
  [ -z "$backup" ] || rm -f "$backup"
  echo "Caddy config geinstalleerd en herladen ($container)"
}

step() { printf '\n==> %s\n' "$*"; }
compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

case "$COMMAND" in
  down) compose down --remove-orphans; exit 0 ;;
  status) compose ps -a; exit 0 ;;
  logs) compose logs -f --tail=100; exit 0 ;;
  caddy) deploy_caddy; exit $? ;;
esac

if [ "$ENVIRONMENT" = production ] && [ "$RESET" = true ]; then
  echo "--reset is niet toegestaan voor production." >&2
  exit 1
fi

step "1/5 Controles ($ENVIRONMENT)"
if [ "$CHECKS" = true ]; then
  (cd frontend && npm ci && npm run check && npm run build)
fi
compose config -q

if [ "$RESET" = true ]; then
  step "Reset: containers en data van $ENVIRONMENT verwijderen"
  compose down -v --remove-orphans
  rm -rf "$PB_DATA_DIR"
fi
mkdir -p "$PB_DATA_DIR"

if [ "$ENVIRONMENT" = production ] && [ -d "$PB_DATA_DIR/data.db" -o -f "$PB_DATA_DIR/data.db" ]; then
  step "Back-up van productiedata"
  mkdir -p backups
  tar -czf "backups/pb_data_$(date +%Y%m%d-%H%M%S).tar.gz" -C "$PB_DATA_DIR" .
fi

step "2/5 Applicatie bouwen"
compose build

step "3/5 Starten, migraties (setup-collections.sh) en data laden (SEED_DEMO=$SEED_DEMO)"
compose up -d --remove-orphans
if [ "$DO_CADDY" = true ]; then
  step "Caddy site config"
  deploy_caddy
fi

step "4/5 Wachten op PocketBase en frontend"
if [ "$ENVIRONMENT" = production ]; then
  DOMAIN="$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
  FRONT_URL="https://$DOMAIN"
else
  FRONT_URL="http://localhost:$FRONTEND_PORT"
fi
for _ in $(seq 1 60); do
  [ "$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | grep '^pb-setup' | awk '{print $2 ":" $3}')" = "exited:0" ] && break
  sleep 3
done
if ! compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | grep -q '^pb-setup exited 0'; then
  compose logs pb-setup | tail -30 >&2
  echo "Migraties zijn mislukt." >&2
  exit 1
fi

step "5/5 Smoke test"
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$FRONT_URL/" && break
  sleep 2
done
curl -fsS -o /dev/null "$FRONT_URL/" || { echo "Frontend niet bereikbaar op $FRONT_URL" >&2; exit 1; }
curl -fsS "$FRONT_URL/api/health" >/dev/null 2>&1 || curl -fsS "http://localhost:${PB_PORT:-8090}/api/health" >/dev/null

printf '\nDeploy %s geslaagd: %s\n' "$ENVIRONMENT" "$FRONT_URL"
