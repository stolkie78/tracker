# T.O.P. Trainer

T.O.P. Trainer is een mobiele trainingslog met een tijdlijn van kracht-, cardio-, interval- en herstelsessies. Versie 1 richt zich op snel vastleggen en terugvinden van trainingen; het Overload Protocol zelf maakt geen deel uit van de app in deze versie. Voor krachttraining ondersteunt de app wel een eenvoudige dubbele progressie: na het voltooien van alle sets op de maximale repgrens stelt de volgende sessie het ingestelde gewichtsstapje hoger voor.

## Stack en structuur

- `frontend/`: SvelteKit als client-side SPA, Svelte, Tailwind CSS en PocketBase JS SDK.
- `scripts/setup-collections.sh`: reproduceerbare, idempotente PocketBase-schema-inrichting.
- `pb_hooks/`: server-side AI-planner endpoint. AI-providerinstellingen zijn persoonlijk en de API-sleutel wordt als verborgen PocketBase-veld opgeslagen.
- `docker-compose.yml`: lokale ontwikkeling met PocketBase op `8090` en frontend op `3000`.
- `docker-compose.prod.yml` + `caddy/conf.d/`: productieopstelling achter de centrale Caddy met automatische HTTPS.
- `pb_data/`: lokale database en bestanden (niet in Git).

Belangrijke frontendlogica staat centraal in `src/lib/pocketbase.ts`, `src/lib/types/index.ts` en `src/lib/stores/`. Routecomponenten gebruiken die API-laag en roepen niet zelf `pb.collection(...)` aan.

## Lokaal starten

1. Kopieer `.env.example` naar `.env` en stel een sterk PocketBase-superuserwachtwoord in.
2. Stel `PB_ADMIN_USER_EMAIL`, `PB_ADMIN_USER_PASSWORD` en eventueel `PB_ADMIN_USER_NAME` in om een applicatie-adminaccount te laten aanmaken. Laat e-mail en wachtwoord allebei leeg om deze stap over te slaan. Gebruik voor de app-admin een eigen wachtwoord dat losstaat van het PocketBase-superuserwachtwoord.
3. Start PocketBase: `docker compose up -d pocketbase`. De container maakt de PocketBase-superuser aan vanuit de twee `PB_SUPERUSER_*`-waarden.
4. Voer het idempotente schemascript uit: `docker compose run --rm pb-setup`. Het script maakt het app-account aan als het nog niet bestaat en zorgt voor een bijbehorend profiel met rol `admin`. Op herhaalde deploys wordt het bestaande wachtwoord niet overschreven.
5. Start de frontend: `docker compose up -d --build frontend`.
6. Open `http://localhost:3000` en meld aan met `PB_ADMIN_USER_EMAIL` en `PB_ADMIN_USER_PASSWORD`.

De frontendcheck en productiebuild zijn onderdeel van de `frontend` Docker-build. Los uitvoeren kan met `cd frontend && npm ci && npm run check && npm run build`.

### Google OAuth

Zet `GOOGLE_CLIENT_ID` en `GOOGLE_CLIENT_SECRET` in het env-bestand (beide of geen); `setup-collections.sh` configureert de Google-provider op de `users`-collectie en schakelt hem uit als de waarden leeg zijn. Voeg `https://<DOMAIN>/api/oauth2-redirect` toe als redirect-URI in de Google OAuth-client. E-mail/wachtwoord blijft beschikbaar.

### Gegevensisolatie

Elke gebruiker ziet alleen eigen data: alle gebruikersdata (workouts, oefeningen in training, sets, plannen, AI-instellingen) heeft een `owner` en de API-regels laten alleen `owner = @request.auth.id` toe; eigenaar wijzigen via update is geblokkeerd. De oefeningencatalogus is gedeeld: iedereen kan lezen en toevoegen, alleen een app-admin kan wijzigen of verwijderen.

### AI-trainingsplanner

Open **Instellingen** in de app en vul een OpenAI-compatibele endpoint-URL, modelnaam en je eigen API-sleutel in. Standaard staan de OpenAI-URL en `gpt-4o-mini` ingevuld; een andere compatibele provider kan ook. De API-sleutel wordt via een geauthenticeerde PocketBase-hook server-side in een verborgen veld opgeslagen. De private collectie heeft geen directe browser-API-regels; de hook geeft alleen endpoint, model en de status van de sleutel terug. De PocketBase-hook stuurt de planningsvraag server-side naar de provider en valideert de periode, beschikbare dagen en opgegeven mix per week voordat resultaten aan de frontend worden teruggegeven. Externe endpoints moeten HTTPS gebruiken; voor lokale modelservers is localhost toegestaan.

Ga daarna naar **AI-planner**, kies periode, doel, niveau, materiaal, beschikbare dagen en het aantal kracht-, cardio-, interval- en herstelsessies per week. Bekijk het gegenereerde schema en sla het op om de trainingen als geplande kaartjes aan je tijdlijn toe te voegen. De krachttrainingen gebruiken de oefeningencatalogus en hebben aanpasbare sets, reps en gewichtsstappen. Controleer AI-schema's altijd zelf; de planner vervangt geen medisch of professioneel trainingsadvies.

De PocketBase-container mount `pb_hooks/` tijdens het starten. Na het toevoegen of wijzigen van hooks moet PocketBase herstart worden voordat de nieuwe route beschikbaar is.

## Deployen

Elke omgeving wordt met één commando uitgerold; zie [DEPLOYMENT.md](DEPLOYMENT.md) voor alle stappen en opties.

```sh
./scripts/deploy.sh test
./scripts/deploy.sh demo
./scripts/deploy.sh production   # back-up, migraties en HTTPS via Caddy
./scripts/deploy.sh test status|logs|down
```

Maak eerst per omgeving een `.env.test`, `.env.demo` of `.env.production` op basis van `.env.example`. Caddy draait als aparte centrale instantie; `deploy.sh` installeert `caddy/conf.d/tracker.setbaas.nl.caddy` en herlaadt Caddy (zie DEPLOYMENT.md). `/api/*` en `/_/*` gaan naar PocketBase, de rest naar de SPA. DNS voor `DOMAIN` moet naar de server wijzen en poorten 80 en 443 moeten bereikbaar zijn voor Let's Encrypt.

## Trainingsgegevens

- **Kracht:** oefeningen, werksets, repbereik, startgewicht en gewichtsstap. Een set telt voor de suggestie als voltooid wanneer deze aangevinkt is. Alleen als elke set het maximum aantal reps haalt, wordt de volgende suggestie met de gewichtsstap verhoogd; anders blijft het gewicht gelijk.
- **Cardio:** activiteit, afstand, gemiddelde hartslag, duur en ervaren inspanning.
- **Interval:** activiteit, werk- en rustduur, aantal rondes en ervaren inspanning.
- **Herstel:** rust, mobiliteit, yoga, wandelen, rekken of een andere herstelactiviteit.

De tijdlijn kan op trainingstype worden gefilterd. De filterkeuze wordt lokaal onthouden.
De oefeningencatalogus bevat 50 veelgebruikte krachtoefeningen, met tien oefeningen per materiaaltype: cable, dumbbell, kettlebell, barbell en machine. Het materiaaltype wordt in de oefeningenkiezer en bij krachttrainingsresultaten getoond. Het idempotente PocketBase-setupscript vult de catalogus automatisch aan.

## Versiegeschiedenis

| Versie | Wijzigingen |
|---|---|
| 0.10.7 | Dashboard toont de eerstvolgende geplande training of training die bezig is. Nieuwe trainingen zijn standaard gepland; wekelijkse reeksen kunnen op meerdere weekdagen starten vanaf een datum, zonder ingeplande tijd. |
| 0.10.6 | Google OAuth configureerbaar via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in het env-bestand; API-regels aangescherpt (eigenaar niet te wijzigen, oefeningencatalogus alleen door admins te wijzigen of verwijderen), getest met twee gebruikers. |
| 0.10.5 | Deploy-standaarden van SetBaas toegepast: `deploy.sh` ondersteunt de commando's `down`, `status` en `logs`; `.dockerignore`-bestanden, Caddy drop-in `caddy/conf.d/tracker.setbaas.nl.caddy` die `deploy.sh` installeert en herlaadt (centrale Caddy via `caddy-net`), uitgebreide `.env.example`, `.env.test.example` en `.gitignore`; README en DEPLOYMENT.md bijgewerkt. |
| 0.10.4 | Bugfix: de naam in "Training toevoegen" wordt nu direct bij het wisselen van trainingstype aangepast, tenzij je de naam zelf hebt getypt (robuustere implementatie dan 0.10.2). |
| 0.10.3 | Het statusveld in "Training toevoegen" is nu een cyclusknop (Gepland → Bezig → Voltooid → Overgeslagen), gelijk aan de trainingsdetailpagina. |
| 0.10.2 | Bugfix: de naam van een nieuwe training volgt nu het gekozen trainingstype (Kracht → Cardio enz.), zolang je de naam niet zelf hebt aangepast. |
| 0.10.1 | Sets invullen op mobiel: reps en kg hebben grote −/+ knoppen (stap 1 of de gewichtsstap, plus snelle ±5 reps / ±4 stappen), een gecentreerd groot invoerveld zonder kleine spinner, en een brede "Set afronden" knop. |
| 0.10.0 | Oefening en materiaal gescheiden: een oefening is nu de beweging (bv. Curl) met meerdere materiaalopties (barbell, cable, ...), het materiaal kies je per training. Oefeningen hebben een spiergroep; in het formulier kies je eerst spiergroep, dan oefening, dan materiaal. Bestaande oefeningen worden gemigreerd; statistieken, voorstellen en AI-planner werken per oefening en materiaal. |
| 0.9.2 | Navigatie opgeschoond en mobielvriendelijk gemaakt: de bovenbalk toont de menu-items als compacte tekstlinks met duidelijke actieve stand (geen omgebroken knoppen meer) en schakelt onder 1024px naar een hamburgermenu; op telefoon staat onderaan een vaste tabbalk (Tijdlijn, Nieuw, Stats, Planner) met safe-area-ondersteuning; uitloggen is een icoon. De setrijen op het oefeningformulier krijgen op smalle schermen meer ruimte voor reps en kg. |
| 0.9.1 | De statusdropdown op de trainingspagina is vervangen door een cycle-knop: één tik schakelt door Gepland → Bezig → Voltooid → Overgeslagen → Gepland en toont welke status daarna komt. |
| 0.9.0 | Nieuwe pagina Statistieken (`/stats`, menu-item) met periodefilter (4 weken, 12 weken, 1 jaar, alles): aantal voltooide trainingen en gemiddelde per week, totale trainingstijd, trainingen per type, hardgelopen kilometers (totaal en langste loop) plus afstand per cardio-activiteit, en groei per oefening: verandering in topgewicht en reps, geschat 1RM, een grafiek van het topgewicht en een tabel per training. Berekeningen staan in `src/lib/stats.ts`. |
| 0.8.0 | Tijdens het trainen kunnen sets worden bijgezet of verwijderd op het oefeningformulier: "Set toevoegen" maakt een extra set aan met het gewicht van de vorige set als startwaarde, een prullenbak per set verwijdert hem weer (minimaal één set blijft staan) en de nummering wordt automatisch herschikt. |
| 0.7.0 | Geplande trainingen zijn te starten: nieuwe status "Bezig" (select-optie via setup-script) met knoppen "Training starten" en "Training afronden". Een krachttraining toont nu een lijst met oefeningen (voortgang per oefening, vinkje als alle sets klaar zijn); elke oefening opent een eigen formulier (`/workouts/[id]/exercise/[exerciseId]`) met grote set-rijen, afvinkknop per set (vult automatisch de doelreps), "Opslaan en volgende oefening" en de overload-suggestie. Het oude gecombineerde formulier met alle oefeningen op één pagina is vervangen. |
| 0.6.1 | Leesbaarheid verbeterd: ontbrekende kleur `primary-950` toegevoegd (veroorzaakte lichte vakjes met lichte tekst in dark mode), iconen en type-labels op de tijdlijn hebben nu een vlakke, krachtige kleur per type met wit icoon (Kracht oranje, Cardio blauw, Interval rood, Herstel groen) en eigen icoon per type; statuslabels hebben meer contrast. |
| 0.6.0 | Standaard deployment-script `scripts/deploy.sh <test\|demo\|production> [--reset] [--no-checks]`: draait `npm ci`, `npm run check` en `npm run build`, bouwt de images, voert de migraties uit (`setup-collections.sh`), laadt voor test en demo de demodata (`seed-demo.sh`, ook een geplande reeks van 4 weken), controleert dat de setup slaagde en doet een smoke test. Production maakt eerst een back-up en weigert `--reset`. Elke omgeving heeft een eigen Compose-project, poorten en datamap en een eigen `.env.<omgeving>`. Procedure vastgelegd in `DEPLOYMENT.md`. |
| 0.5.0 | Een training kan nu vooruit gepland worden als wekelijkse reeks: kies status Gepland, vink "Wekelijks herhalen" aan en geef het aantal weken (bijv. 4). Elke week op dezelfde weekdag en tijd wordt een training aangemaakt met alle oefeningen (bijv. Kracht → Upper met meerdere oefeningen), sets, herhalingsbereik en gewichtsstap. Reeksen delen een `series_id` (nieuw veld op `workouts`, toegevoegd via setup-script); op de detailpagina kun je alle nog geplande trainingen van een reeks in één keer verwijderen. |
| 0.4.0 | De oefeningencatalogus uitgebreid tot 50 veelgebruikte krachtoefeningen, gelijk verdeeld over cable, dumbbell, kettlebell, barbell en machine. Setup blijft de oefeningen zonder duplicaten aanvullen; materiaaltypen zijn zichtbaar bij het kiezen en terugzien van krachtoefeningen, en een zelf toegevoegde oefening krijgt nu ook een expliciete materiaalkeuze. |
| 0.3.0 | Een AI-trainingsplanner toegevoegd waarmee een gemengd schema van 1–12 weken kan worden gegenereerd op basis van doel, ervaringsniveau, materiaal, beschikbare dagen en wekelijkse aantallen kracht-, cardio-, interval- en herstelsessies. Het AI-voorstel kan eerst worden nagekeken en daarna als periodeplan met geplande trainingen en krachtsets aan de tijdlijn worden toegevoegd. Een persoonlijke instellingenpagina bewaart endpoint, model en API-sleutel; de sleutel staat in een verborgen PocketBase-veld met gesloten directe collection-regels en wordt uitsluitend via beveiligde server-side PocketBase-hooks opgeslagen en gebruikt. |
| 0.2.0 | App-adminbootstrap toegevoegd aan het idempotente PocketBase-setupscript. Met `PB_ADMIN_USER_EMAIL`, `PB_ADMIN_USER_PASSWORD` en optioneel `PB_ADMIN_USER_NAME` wordt bij de eerste setup een loginaccount met geverifieerd e-mailadres en bijbehorend admin-profiel aangemaakt; latere deploys behouden het bestaande accountwachtwoord en herstellen zo nodig de profielrol. |
| 0.1.0 | Eerste versie van T.O.P. Trainer met client-side SvelteKit-frontend, PocketBase-authenticatie en schema-as-code; een mobielvriendelijke chronologische trainingsfeed met trainingstypen kracht, cardio, interval en herstel; typegerichte invoervelden, status en notities; krachtsets met instelbaar repbereik en gewichtsstap inclusief suggestie voor de volgende sessie; centrale PocketBase-API, gedeelde types en labelmappings, auth- en rolstores, dark-modecomponentklassen, Docker Compose voor lokale ontwikkeling en productie en Caddy-configuratie voor HTTPS. |
