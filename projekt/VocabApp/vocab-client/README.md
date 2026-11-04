# VocabApp kliens

A VocabApp Angular 19 kliense. Az API a `../VocabApp.Api` mappában van (ASP.NET Core, SQL Server).

## Indítás

A `..\start-dev.bat` az API-t (`http://localhost:5152`) és a klienst (`http://localhost:4567`) is elindítja:

```bat
..\start-dev.bat [start|stop|restart|status]
```

Csak a kliens: `npm install`, majd

```bash
npm start
```

Az `npm start` és a sima `ng serve` is a `proxy.conf.json`-nal fut (az `angular.json` `proxyConfig` beállítása miatt), ami az `/api` hívásokat az 5152-es portra továbbítja.

## Demo felhasználók

Az API minden induláskor létrehozza őket, ha hiányoznak:

- `demo@vocab.local` / `DemoUser1`
- `second@vocab.local` / `SecondUser1`

## Build

```bash
ng build --configuration development
```

A production build (`npm run build`) sikeres.

## Tesztek

A Karma be van állítva (`npm test`), de spec fájl még nincs. E2E teszt nincs.
