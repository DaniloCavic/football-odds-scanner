# Football Odds Scanner

Web aplikacija za ručno skeniranje fudbalskih kvota (≤ 1.30), trajni filter tipova, automatsko praćenje
rezultata i statistiku prolaznosti sa simulacijom profita/gubitka (1.000 RSD po tipu).

> Aplikacija služi isključivo za analizu i statistiku. Ne postavlja opklade.

## Status po fazama

| Faza | Sadržaj | Status |
|---|---|---|
| 1 | Osnova, baza, prijava, navigacija, dashboard, dark UI | ✅ odobreno |
| 2 | Robot – izvor kvota, ručni scan, ≤ 1.30, samo fudbal | ✅ odobreno |
| 3 | Filter – drag & drop, trajno čuvanje, filter setovi | ✅ odobreno |
| 4 | Result Tracker – rezultati, obračun, statusi | ✅ gotovo – čeka test |
| 5 | Statistika, profit po filteru, istorija | ⏳ |
| 6 | Završno testiranje i produkcija | ⏳ |

## Izvor kvota (faza 2)
Soccerbet nema javni API, a scraping njihovog sajta ne koristimo. Kvote dolaze preko **OddsPapi** agregatora
(bukmejker `soccerbet.rs`, fudbal `sportId=10`). Ključ se postavlja kao `ODDSPAPI_API_KEY` (samo na serveru).

- Robot se pokreće isključivo ručno (START ROBOT), može da se zaustavi (STOP).
- Troši malo zahteva: 1 × `/markets` (keš 24h) + 1 × `/fixtures` po periodu do 9 dana + 1 × `/odds-by-tournaments` na svaka 3 turnira.
- Limit zahteva po skeniranju je u Podešavanjima (podrazumevano 60). Stanje mesečne kvote se čita preko `/account`, koji ne troši kvotu.
- Pravilo kvote je centralno, u `isValidOdds` (`src/lib/odds.ts`): mora biti > 1.00 i ≤ 1.30. Virtuelni fudbal, e-sport i simulacije izbacuje `src/lib/robot/football.ts`.
- Svako skeniranje čuva nove zapise kvota sa vremenom i izvorom, a stare nikada ne prepisuje.
- Bez ključa radi samo **DEMO** izvor (izmišljene utakmice, jasno označene).

## Filter (faza 3)
- Imenovani filteri (FilterSet) sa ulogom po tipu (podrazumevano 1.000 RSD iz Podešavanja).
- Tip se dodaje prevlačenjem ili dugmetom +. U bazi se čuva odmah, sa nepromenljivim snimkom kvote i uloga.
- Isti tip iste utakmice ne može dvaput u isti filter (unique + serializable transakcija). Različiti tipovi iste utakmice mogu.
- Uklanjanje, čišćenje i brisanje su "meki": zapis ostaje za statistiku. Čišćenje i brisanje se beleže u AuditLog.
- Utakmica koja je počela ne može da se doda. Pravilo kvote se ponovo proverava na serveru.

## Result Tracker (faza 4)
- Radi u samom serveru (`src/instrumentation.ts`), na svakih 5 minuta, i kad je browser zatvoren. Robot za kvote ostaje isključivo ručni.
- **Primarni izvor: API-Football** (`APIFOOTBALL_API_KEY`). Jedan zahtev `/fixtures?date=` pokriva sve utakmice jednog dana, uz keš od `resultCheckMinutes` (podrazumevano 15 min) i limit od 90 zahteva dnevno. Besplatan paket vidi samo juče, danas i sutra.
- **Rezervni izvor: OddsPapi** `/v4/settlements` (ista šifra utakmice). Koristi se samo kad API-Football ne prepozna utakmicu sigurno ili je nema. Ima dnevni limit u Podešavanjima.
- **Prepoznavanje utakmice:** oba tima (normalizovana imena), vreme ±3h i vrsta ekipe (ženska/rezervna/mlađa, i iz imena takmičenja). Sigurno poklapanje je HIGH. Nesigurno (MEDIUM) traži potvrdu drugog izvora, a nejasno ide u NEEDS_REVIEW.
- **Obračun:** važi rezultat posle 90 min + nadoknade (`score.fulltime`). WON = ulog × kvota, LOST = −ulog, VOID = vraćen ulog. Obračun je idempotentan (prelaz samo iz otvorenih statusa, uz zaključavanje posla u bazi).
- **Statusi:**
  - PST → POSTPONED
  - CANC → VOID
  - ABD/AWD → NEEDS_REVIEW
  - izvori se ne slažu → NEEDS_REVIEW
  - nema rezultata 36h → NEEDS_REVIEW
- **Ručna ispravka** (samo ADMIN) traži obavezno obrazloženje i ide u AuditLog.
- **DEMO utakmice** dobijaju izmišljen rezultat, označen kao „DEMO“.
- `TRACKER_ENABLED=false` gasi automatsko pokretanje, a `TRACKER_INTERVAL_MS` menja interval.

## Tehnologije
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Vitest · Playwright

## Pokretanje na Railway-u
Pogledajte **[RAILWAY.md](RAILWAY.md)**.

## Lokalno pokretanje (za programere)
```bash
cp .env.example .env          # upišite DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma migrate dev        # pravi tabele
npm run db:seed               # pravi admin nalog i podešavanja
npm run dev                   # http://localhost:3000
```

## Testovi
```bash
npm run lint && npm run typecheck   # stil i tipovi
npm test                            # unit testovi
npm run test:integration            # integracioni (baza fos_itest)
npm run build && npm run test:e2e   # e2e – koristi posebnu bazu fos_test (E2E_DATABASE_URL)
```
E2E testovi brišu podatke iz test baze, zato baza mora da se zove `*_test`.

## Struktura
```
prisma/              šema baze, migracije, seed (admin nalog + podešavanja)
src/app/login        prijava (server actions, rate limit 5 pokušaja / 15 min)
src/app/(app)        zaštićene stranice: dashboard, robot, filter, aktivne, statistika, istorija, podešavanja
src/lib              baza, sesije, lozinke, validacija podešavanja, formatiranje
tests/unit           Vitest
tests/e2e            Playwright (desktop + telefon)
```

## Bezbednost
- Lozinke se čuvaju kao bcrypt hash. Sesija je nasumičan token u httpOnly cookie-ju, a u bazi je samo njegov SHA-256.
- Sve stranice osim `/login` i `/api/health` zahtevaju prijavu.
- Tajne su samo u environment varijablama.
- Promene podešavanja se upisuju u `AuditLog`.
- Maksimalna kvota se proverava na serveru i ne može biti veća od 1.30.
