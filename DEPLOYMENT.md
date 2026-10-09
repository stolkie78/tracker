# Deployment

Elke omgeving wordt op exact dezelfde manier uitgerold met één script:

```bash
./scripts/deploy.sh <test|demo|production> [deploy|down|status|logs|caddy] [--reset] [--no-checks]
```

Commando's: `caddy` (alleen de reverse proxy bijwerken), `deploy` (standaard), `down` (containers stoppen), `status` (containerstatus) en `logs` (logs volgen).

| Omgeving | Compose-bestand | Frontend | PocketBase | Demodata | Datamap |
|---|---|---|---|---|---|
| `test` | `docker-compose.yml` | http://localhost:3100 | http://localhost:8191 | ja | `pb_data_test/` |
| `demo` | `docker-compose.yml` | http://localhost:3200 | http://localhost:8291 | ja | `pb_data_demo/` |
| `production` | `docker-compose.prod.yml` | `https://$DOMAIN` (centrale Caddy + Let's Encrypt) | achter Caddy | nee | `pb_data_production/` |

Elke omgeving draait als eigen Compose-project (`top-trainer-<omgeving>`), dus ze kunnen naast elkaar bestaan.

## Voorbereiding

Maak per omgeving een env-bestand op basis van `.env.example`: `.env.test`, `.env.demo`, `.env.production` (staan in `.gitignore`).

| Variabele | Doel |
|---|---|
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | PocketBase-superuser, gebruikt door de setup-scripts |
| `PB_ADMIN_USER_EMAIL` / `PB_ADMIN_USER_PASSWORD` / `PB_ADMIN_USER_NAME` | Applicatie-admin (verplicht voor demodata) |
| `DOMAIN` | Domein voor Caddy (alleen production) |

## Stappen die het script altijd uitvoert

1. **Controles**: `npm ci`, `npm run check` en `npm run build` in `frontend/`, plus `docker compose config -q`. Een fout stopt de deploy.
2. **Back-up** (alleen production, als er al data is): `backups/pb_data_<tijdstempel>.tar.gz`.
3. **Bouwen**: `docker compose build` van de frontend-image.
4. **Migraties en data**: `pb-setup` draait `scripts/setup-collections.sh` (schema, 50 oefeningen, admin-gebruiker; idempotent). Bij `test` en `demo` volgt `scripts/seed-demo.sh` (voorbeeldtrainingen en een geplande reeks van 4 weken; slaat zichzelf over als de data er al is).
5. **Verificatie**: wacht tot `pb-setup` succesvol eindigt (anders worden de logs getoond en faalt het script) en voert een smoke test uit op frontend en `/api/health`.

## Opties

- `--reset`: verwijdert containers en data van de gekozen omgeving en start schoon. Niet toegestaan voor `production`.
- `--no-checks`: slaat `npm ci/check/build` over (bijv. voor een snelle herstart). Niet gebruiken voor een echte release.

## Voorbeelden

```bash
./scripts/deploy.sh test --reset   # schone testomgeving met demodata
./scripts/deploy.sh demo           # demo bijwerken zonder data te wissen
./scripts/deploy.sh production     # release met back-up en migraties
```

## Standaard werkwijze bij een testdeploy

Rol bij elke wijziging eerst `./scripts/deploy.sh test` uit (bij schemawijzigingen eventueel met `--reset` om te bewijzen dat een lege omgeving correct opbouwt), controleer de timeline en de nieuwe functie in de browser, en rol daarna pas `demo` en `production` uit.

## Reverse proxy (Caddy)

Caddy draait als aparte, centraal beheerde instantie op de server (docker-netwerk `caddy-net`, drop-ins in `$HOME/apps/caddy/conf.d/*.caddy`, hoofd-Caddyfile met `import /etc/caddy/conf.d/*.caddy`). De siteconfig staat in de repo: `caddy/conf.d/tracker.setbaas.nl.caddy` (production; `test` en `demo` publiceren poorten direct).

`./scripts/deploy.sh production` kopieert het bestand naar de conf.d van Caddy als het afwijkt, valideert het met `caddy validate`, herlaadt Caddy en draait bij een fout de vorige versie terug. Alleen de proxy bijwerken: `./scripts/deploy.sh production caddy`; overslaan: `--no-caddy`; forceren: `--caddy`.

| Variabele (`.env.production`) | Standaard | Betekenis |
|---|---|---|
| `CADDY_CONF_DIR` | `$HOME/apps/caddy/conf.d` | Map waar Caddy drop-ins leest |
| `CADDY_CONTAINER` | automatisch | Naam van de Caddy-container |
| `CADDY_CONFIG_PATH` | `/etc/caddy/Caddyfile` | Hoofd-Caddyfile in de container |

De production-containers heten `top-trainer-pb` en `top-trainer-frontend` en hangen ook aan `caddy-net`; DNS van `tracker.setbaas.nl` moet naar de server wijzen.
