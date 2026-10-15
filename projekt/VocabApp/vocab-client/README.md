# VocabApp kliens

A VocabApp Angular 19 kliense. Az API a `../VocabApp.Api` mappában van (ASP.NET Core, SQLite).

## Indítás

A `..\start-dev.bat` az API-t (`http://localhost:5152`) és a klienst (`http://localhost:4200`) is elindítja:

```bat
..\start-dev.bat [start|stop|restart|status]
```

Csak a kliens: `npm install`, majd

```bash
npm start
```

**Ne sima `ng serve`-et használj.** A `npm start` a `proxy.conf.json`-nal indít, ami az `/api` hívásokat az 5152-es portra továbbítja. Proxy nélkül ezek elhasalnak.

## Demo felhasználók

Az API minden induláskor létrehozza őket, ha hiányoznak:

- `demo@vocab.local` / `DemoUser1`
- `second@vocab.local` / `SecondUser1`

## Build

```bash
ng build --configuration development
```

A production build (`npm run build`) jelenleg elbukik: a `decks.component.ts` stílusa átlépi az `angular.json`-ban megadott 8 kB-os hibahatárt.

## Tesztek

A Karma be van állítva (`npm test`), de spec fájl még nincs. E2E teszt nincs.
