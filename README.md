# Hisense TV Dashboard

Lokale Fernbedienung für einen Hisense-Fernseher mit VIDAA. Die Seite läuft auf dem eigenen Rechner und spricht den Fernseher im Heimnetz an.

## Voraussetzungen

- Node.js 20 oder neuer
- Fernseher und Rechner im selben Netz
- Client-Zertifikat der VIDAA-App, siehe unten

## Zertifikat

`config.json` nennt `src/certs/vidaa_client.pem` und `src/certs/vidaa_client.key`. Liegen beide schon da, bleibt alles unverändert. Fehlen sie, lädt das Programm sie einmal in diesen Ordner. Das Zertifikat steht nicht im Quelltext. Wer eine eigene Datei aus der VIDAA-App hat, legt die `.p12` vorher in `src/certs/`.


## Start

```bash
npm install
npm run dev
```

Danach die Seite im Browser öffnen: http://127.0.0.1:5174

`npm run dev` baut die Oberfläche und startet den lokalen Server. `npm start` macht dasselbe. `npm run typecheck` prüft nur die Typen.

## Konfiguration

Die laufende Konfiguration steht in `config.json` im Projektroot. Eine Vorlage ohne echte Gerätedaten liegt in `config.example.json`.

| Feld                                         | Bedeutung                                                |
| -------------------------------------------- | -------------------------------------------------------- |
| `locale`                                     | Sprache der Oberfläche: `de` oder `en`                   |
| `server.host`, `server.port`                 | Adresse der lokalen Seite                                |
| `tv.host`                                    | IP-Adresse des Fernsehers                                |
| `tv.port`                                    | VIDAA-Port, üblich `36669`                               |
| `tv.macAddress`                              | MAC-Adresse des Fernsehers                               |
| `tv.brand`, `tv.model`, `tv.operatingSystem` | Anzeige in der Oberfläche                                |
| `certs.certFile`, `certs.keyFile`            | Pfade zu Zertifikat und Schlüssel                        |
| `storage`                                    | Ablage der Kopplung im Home-Verzeichnis                  |
| `logFile`                                    | Protokolldatei unter `assets/`, der Name endet auf `log` |

Texte der Oberfläche stehen in `src/i18n/de/ui.json` und `src/i18n/en/ui.json`, Meldungen des Servers in `src/i18n/de/server.json` und `src/i18n/en/server.json`.

## Kopplung

1. Am Fernseher die Einstellung für die Steuerung durch mobile Geräte einschalten.
2. Auf der Seite **PIN am TV anzeigen** drücken.
3. Die PIN vom Fernseher eintragen und bestätigen.
4. Danach senden die Tasten Ein/Aus, Navigation, Lautstärke, Stumm, Home, Zurück und Wiedergabe.

Die Kopplung wird lokal gespeichert. Ein neues Sitzungsfenster des Fernsehers kann erneut nach einer PIN fragen.

## Öffentliche Pakete

| Paket                                                    | Rolle                          |
| -------------------------------------------------------- | ------------------------------ |
| [mqtt-packet](https://www.npmjs.com/package/mqtt-packet) | MQTT-Nachrichten zum Fernseher |
| [tsx](https://www.npmjs.com/package/tsx)                 | Start des Servers              |
| [vite](https://www.npmjs.com/package/vite)               | Build der Oberfläche           |
| [typescript](https://www.npmjs.com/package/typescript)   | Typprüfung                     |
| [@types/node](https://www.npmjs.com/package/@types/node) | Node-Typen                     |

## Autor

Munir Mardinli

- https://github.com/munirmardinli
- https://munir.mardinli.dev

## Lizenz

MIT. Siehe [LICENSE](LICENSE).

Teile beruhen auf [vidaa-control](https://github.com/tombabolewski/vidaa-control) von Tom Babolewski.
