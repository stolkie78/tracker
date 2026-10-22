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

De hoofdnavigatie toont **Training**, **Health** en **Insights**. Instellingen en Profiel zijn herkenbaar aan hun icoon; onder Profiel staan de themawissel en uitloggen. **Insights** (`/stats`, bestaande links blijven werken) combineert trainingsresultaten, lichaamsmetingen en fasting-check-ins binnen dezelfde periode. Fastingdagen worden over alle programma's per kalenderdag ontdubbeld. Mindfulness-sessies worden nog niet opgeslagen; het lokale braintrainingrecord blijft onder Health.

Elke gebruiker ziet alleen eigen data: alle gebruikersdata (workouts, oefeningen in training, sets, plannen, AI-instellingen) heeft een `owner` en de API-regels laten alleen `owner = @request.auth.id` toe; eigenaar wijzigen via update is geblokkeerd. De standaard oefeningencatalogus is gedeeld en alleen een app-admin kan deze wijzigen of verwijderen. Nieuw toegevoegde oefeningen zijn persoonlijk, ook voor de AI-planner. Bestaande catalogusoefeningen zonder eigenaar blijven gedeeld omdat hun oorspronkelijke maker niet is vastgelegd.

**Profiel** (`/profile`) bevat een eigen naam, optionele geboortedatum, telefoonnummer en trainingsdoelen. Een profielfoto (JPG, PNG of WebP, maximaal 5 MB) is een beschermd bestand: ook de bestands-URL vereist autorisatie als eigenaar. Profielen zijn uniek per gebruiker; gebruikers kunnen hun eigenaar of rol niet wijzigen. De rollen `coach` en `admin` geven geen toegang tot persoonlijke gegevens van anderen; trainer/clientdeling is nog niet ingeschakeld. Accountrecords zijn alleen voor het eigen account leesbaar.

Onder **Health → Metingen** (`/health/measurements`) voeg je met **Nieuw** gedateerde metingen van gewicht, lengte en optionele tailleomtrek toe of verwijder je een foutieve meting. Bestaande metingen blijven behouden. De laatst gemeten lengte wordt vooraf ingevuld; als er nog geen meting is, wordt een eerder opgeslagen profiellengte gebruikt. **Insights** toont gewicht, BMI, gewichtsverandering, meetgeschiedenis en een grafiek met keuze uit gewicht, BMI of taille binnen de gekozen periode, ook zonder voltooide trainingen. De horizontale as volgt de werkelijke meetdatums; ontbrekende taillemetingen worden niet als nul getekend. BMI wordt berekend met de lengte van die specifieke meting. BMI is geen diagnose.

Persoonlijke relaties (zoals sets naar oefeningen en trainingen naar programma's) worden bij aanmaken op dezelfde eigenaar gecontroleerd en kunnen achteraf niet naar een ander record worden verplaatst. Bij een accountwissel wordt de pagina opnieuw geladen en worden profiel- en rolgegevens gewist. Lokale tijdlijnfilters, braintrainingrecords en Strava-synchronisatiestatus zijn per account gescheiden; oude, ongescheiden browserwaarden worden niet overgenomen.

Draai na deze update `docker compose run --rm pb-setup` en herstart PocketBase om de nieuwe profielvelden, beschermde foto's, collectie `body_measurements`, unieke profielindex, validatiehooks en aangescherpte regels te activeren. Als bestaande profielen dubbel zijn voor dezelfde gebruiker, stopt de indexmigratie expliciet; los die duplicaten eerst op zonder persoonlijke gegevens te verliezen.

Regressietests: `cd frontend && npm test` controleert BMI, meetgrafieken, periodeberekeningen, cycli en dagdelen. `PB_TEST_URL=... PB_TEST_SUPERUSER_EMAIL=... PB_TEST_SUPERUSER_PASSWORD=... node --test scripts/user-isolation.test.mjs` test de API-regels, relaties, metingen, beschermde foto's en atomair bewerken van bouwblokken met drie accounts (atleet, coach, admin). Gebruik uitsluitend een wegwerp-PocketBase met het setupscript en de hooks; de test maakt tijdelijke records en ruimt die weer op.

### Workouts, losse sessies en programma's

Op de trainingsdetailpagina kies je **Overgeslagen** via dezelfde statuswisselaar als de andere keuzes, zonder aparte knop Overslaan. De training blijft zichtbaar in de tijdlijn en telt niet mee als voltooide training in Insights. Via de statuswisselaar kun je deze weer op Gepland zetten. Alleen losse trainingen hebben een knop Verwijderen; trainingen en reeksen die aan een programma zijn gekoppeld beheer je vanuit Programma’s, via **Programma beheren**.

Overgeslagen trainingskaarten zijn grijs en voltooide kaarten groen, ook als de training vandaag is gepland. Dit geldt in de tijdlijn en op de trainingsdetailpagina, in licht en donker thema. Bij **Training afronden** voor hardlopen (ook interval) vul je eerst de werkelijk gelopen afstand in km en tijd in `uu:mm:ss` in. Afstand, tijd en de status Voltooid worden samen opgeslagen; annuleren laat de training ongewijzigd. Ook afronden via de statuswisselaar vraagt deze gegevens. De tijd blijft op seconden nauwkeurig bewaard en wordt bij hardlooptrainingen als `uu:mm:ss` getoond.

**Workouts** is de nieuwe naam van Bibliotheek; het extra kopje Bouwblokken vervalt. De URL `/library` blijft behouden voor bestaande links.

Vaste keuzes zoals type, niveau, activiteit, materiaal, dagdeel en cyclusduur zijn klikschakelaars: elke klik kiest de volgende waarde en na de laatste begint de reeks opnieuw. De knop toont de huidige waarde; het ronde-pijlenicoon en de tooltip geven aan dat je kunt wisselen. Ook met Tab en Enter of spatie te bedienen. Oefeningen en workouts blijven dropdowns. Instellingen met één beschikbare keuze zijn niet wisselbaar; knoppen blijven geblokkeerd tijdens opslaan of een lopende ademhalingsoefening.

- **Workouts** (`/library`): maak een workout in twee korte stappen: kies eerst kracht, cardio, interval, herstel of sporten en vul daarna alleen de bijbehorende velden in. Doel is geen invoerveld meer; bestaande doelen blijven bewaard. Niveau, tags, notities en uitgebreide oefenopties staan ingeklapt onder extra opties. Tijdens aanmaken of bewerken is de workoutlijst verborgen. Een workout start je direct of plan je als losse sessie op een datum en dagdeel.
- Met **Bewerken** pas je alle gegevens en krachtoefeningen van een bouwblok aan, inclusief materiaal, sets, reps, gewichtsstap, rust en tempo. Het bouwblok behoudt zijn ID en blijft bruikbaar in programma's. Bestaande geplande en uitgevoerde trainingen blijven ongewijzigd; nieuwe trainingen gebruiken de gewijzigde versie. Bouwblok en oefeningen worden samen in één servertransactie opgeslagen; een fout laat geen halve wijziging achter. Herstart PocketBase voor de nieuwe `templates.pb.js`-hook. Aanmaakknoppen heten consequent **Nieuw**.
- **Programma** (`/programs`): stel een vaste cyclus van één, twee of drie weken in en kies het aantal herhalingen. De cyclus begint precies op de gekozen startdatum en bevat 7, 14 of 21 volledige dagen, inclusief rustdagen. Iedere week heeft een eigen schema. Voeg per dag meerdere bouwblokken toe onder Ochtend, Middag of Avond, bijvoorbeeld kracht gevolgd door mobiliteit; de volgorde is aanpasbaar. Opslaan maakt geplande trainingen met hun eigen dagdeel. Flexibele cycli zijn niet meer aan te maken of te bewerken; eventuele oude records blijven zichtbaar en verwijderbaar. Bestaande vaste weekschema's kunnen nog worden geopend; oude bouwblokken worden ingedeeld in de ochtend.
- Losse sessies en programma-trainingen staan op dezelfde tijdlijn, gegroepeerd per datum en dagdeel. Programma-trainingen zijn herkenbaar aan het programmalabel. Trainingen zonder opgeslagen dagdeel staan onder Zonder dagdeel; er wordt geen indeling verzonnen. Een dagdeel is geen exacte starttijd; de agenda-export gebruikt daarvoor 09:00, 14:00 en 19:00 als planningsanker.
- Draai na een update `docker compose run --rm pb-setup` om het nieuwe optionele veld `workouts.day_part` toe te voegen voordat je de frontend gebruikt. Herstart PocketBase voor gewijzigde hooks.

### AI-trainingsplanner

Open **Instellingen** in de app en vul een OpenAI-compatibele endpoint-URL, modelnaam en je eigen API-sleutel in. Standaard staan de OpenAI-URL en `gpt-4o-mini` ingevuld; een andere compatibele provider kan ook. De API-sleutel wordt via een geauthenticeerde PocketBase-hook server-side in een verborgen veld opgeslagen. De private collectie heeft geen directe browser-API-regels; de hook geeft alleen endpoint, model en de status van de sleutel terug. De PocketBase-hook stuurt de planningsvraag server-side naar de provider en valideert de periode, beschikbare dagen en opgegeven mix per week voordat resultaten aan de frontend worden teruggegeven. Externe endpoints moeten HTTPS gebruiken; voor lokale modelservers is localhost toegestaan.

Ga daarna naar **AI-planner**, kies periode, doel, niveau, materiaal, beschikbare dagen en het aantal kracht-, cardio-, interval- en herstelsessies per week. Bekijk het gegenereerde schema en sla het op om de trainingen als geplande kaartjes aan je tijdlijn toe te voegen. De krachttrainingen gebruiken de oefeningencatalogus en hebben aanpasbare sets, reps en gewichtsstappen. Controleer AI-schema's altijd zelf; de planner vervangt geen medisch of professioneel trainingsadvies.

De AI-planner verschijnt alleen als er voor het ingelogde account een API-sleutel is opgeslagen. Een leeg sleutelveld bij een al opgeslagen sleutel betekent niet dat deze ontbreekt: de geheime sleutel wordt nooit teruggestuurd. Na opslaan verschijnt de planner direct. Een rechtstreekse link naar `/planner` toont zonder sleutel alleen een verwijzing naar Instellingen; bij een laadfout verschijnt een expliciete melding met opnieuw proberen. De beschikbaarheid wordt bij een accountwissel gewist.

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
| 0.19.2 | Overgeslagen trainingskaarten grijs en voltooide kaarten groen in licht en donker thema. Hardlooptrainingen vragen bij afronden om de werkelijke afstand en tijd (uu:mm:ss), ook via de statuswisselaar en bij interval; resultaten en status worden samen opgeslagen. |
| 0.19.1 | Workoutstatus gebruikt dezelfde compacte switcher als andere keuzes, inclusief Overgeslagen, zonder zichtbare preview of losse knop Overslaan. Programmatrainingen en gekoppelde reeksen hebben geen verwijderknop op de trainingspagina; beheer verloopt via Programma beheren. Statusacties zijn geblokkeerd tijdens opslaan. |
| 0.19.0 | Bibliotheek heet Workouts; het kopje Bouwblokken vervalt en menu's en meldingen gebruiken dezelfde naam. Vaste keuzes zijn klikschakelaars die per klik naar de volgende waarde gaan en na de laatste opnieuw beginnen. Oefeningen en workouts blijven dropdowns. Bestaande URL's en gegevens blijven behouden. |
| 0.18.0 | Vaste cycli van 1, 2 of 3 weken vanaf de gekozen startdatum vervangen de flexibele cyclus. Meerdere bouwblokken per ochtend, middag en avond, met instelbare volgorde en dezelfde dagdeelindeling in de tijdlijn. Bieb-formulier in twee stappen: type kiezen en relevante velden invullen, zonder Doel en met ingeklapte extra opties. Workoutlijst verborgen tijdens aanmaken en bewerken. Voer pb-setup uit voor workouts.day_part en herstart PocketBase. |
| 0.17.0 | AI-planner alleen zichtbaar met een opgeslagen API-sleutel. Bouwblokken in de Bieb volledig en atomair bewerken zonder bestaande trainingen te wijzigen. Metingen verplaatst van Profiel naar Health met grafieken voor gewicht, BMI en taille in Insights. Aanmaakknoppen consequent Nieuw. Herstart PocketBase voor de nieuwe templates-hook. |
| 0.16.0 | Training, Health en Insights als duidelijke hoofdfuncties; Instellingen en Profiel als iconen. Themawissel en uitloggen verplaatst naar Profiel. Insights combineert trainingsresultaten, lichaamsmetingen en fasting-check-ins met een gezamenlijk periodefilter. |
| 0.15.0 | Persoonlijke profielpagina met beschermde profielfoto, persoonsgegevens en lengte. Gedateerde lichaamsmetingen met gewicht, BMI, tailleomtrek en gewichtsverandering in statistieken. Aangescherpte eigenaars- en relatieregels, persoonlijke nieuwe oefeningen en gescheiden browsergegevens per account. Trainer/clienttoegang blijft uitgeschakeld. Voer het setupscript opnieuw uit en herstart PocketBase. |
| 0.14.0 | Nieuwe categorie Sporten (zaalvolleybal, beachvolleybal, pickleball, voetbal, tennis, basketbal) als bouwblok en training. In een programma met vaste weekdagen kun je meerdere trainingen op één dag plannen. Programma's kunnen achteraf worden bewerkt (toekomstige trainingen worden opnieuw ingepland, uitgevoerde blijven staan) of verwijderd, en een training is te bewerken (titel, datum, duur, details, notities). Nieuw veld `sport_activity` en type `sport`. |
| 0.13.2 | Nieuwe schouderoefeningen: Front raise, Pike push-up, Dips, Upright row, Rear delt fly, Cable cross rear delt pull en Inverted row. |
| 0.13.1 | Bij het maken van een kracht-bouwblok kun je de oefeningen filteren op spiergroep, zodat je niet meer één lange lijst hebt. |
|---|---|
| 0.12.1 | Bouwblokken in de keuzelijsten van het programma beginnen met hun type (Kracht, Hardlopen, Interval, Herstel), zodat het type niet meer in de naam hoeft. |
| 0.12.0 | Bouwblokken en programma's: een bibliotheek met standaard trainingen (kracht, cardio, interval, herstel; met niveau, doel en tags) die je direct start, als losse sessie inplant of in een programma gebruikt. Programma's werken met vaste weekdagen of een flexibele cyclus (bijv. 10 of 21 dagen) waarin de bouwblokken in willekeurige volgorde worden afgerond, met voortgang per cyclus. Programma-trainingen zijn herkenbaar op de tijdlijn; het formulier "Losse training" is vervallen. Nieuwe collecties `workout_templates` en `template_exercises`, nieuwe velden op `training_plans` en `workouts`; `deploy.sh` kent `SEED_DEMO_OVERRIDE`. |
| 0.11.0 | Strava-koppeling: hardloopactiviteiten worden automatisch geïmporteerd (elke 30 minuten en bij openen van de app), gekoppeld aan een geplande hardlooptraining van dezelfde dag en bijgewerkt bij wijzigingen. Statistieken tonen hardloopafstand, tempo, hoogtemeters en hartslag. Sets worden direct per set opgeslagen en er is een rusttimer. |
| 0.10.9 | Krachtoefeningen bevatten nu instelbare rust tussen sets en tempo, standaard 90 seconden rust en tempo 3-1-1-0; de waarden zijn zichtbaar bij het trainingsschema en tijdens de oefening. |
| 0.10.8 | Dashboard licht actieve trainingen en trainingen van vandaag uit, toont de actieve en eerstvolgende training apart en markeert de eerstvolgende training extra. |
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

### Oefening tijdens de training toevoegen

Op de detailpagina van elke krachttraining (geplande programmasessie of losse training) kun je met **Oefening toevoegen** op elk moment een extra oefening toevoegen. Bij een geplande reeks geldt dit alleen voor die ene sessie.

### Health

Onder **Health** staan leefstijlprogramma's los van trainingen, met drie onderdelen:

- **Fasting**: OMAD (One Meal A Day), 16:8 en 12:12. Per protocol een weekmaaltijdplanner (met voorstel), start van maaltijd of eetvenster, calorie- en eiwitdoel, een dagelijkse check-in met reeksen, een aftelklok naar het eetvenster en een motivator. De collecties `health_programs` en `health_checkins` worden automatisch aangemaakt door `./scripts/deploy.sh <omgeving>` (zie `DEPLOYMENT.md`).
- **Mindfulness**: ademhalingsoefening met kiesbaar ritme en duur.
- **Braintraining**: cijfergeheugenspel met persoonlijk record (lokaal opgeslagen).

Dit is geen medisch advies.

### Agenda-feed (iCal)

Onder **Instellingen → Agenda (iCal)** staat een persoonlijke, geheime abonnement-link (`/api/top-trainer/calendar/<token>/timeline.ics`). Voeg die toe in een agenda-app (Apple Agenda, Google Agenda, Outlook, ...): elke training uit je tijdlijn (laatste 90 dagen en alles daarna, behalve overgeslagen) wordt een afspraak met in de omschrijving en het URL-veld een directe link naar de training (`/workouts/<id>`). Met "Nieuwe link" maak je een nieuw token en vervalt de oude. Stel `APP_URL` in als de publieke URL afwijkt; draai na een update `docker compose run --rm pb-setup` voor de `calendar_feeds`-collectie.
