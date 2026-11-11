# Glass Reader

A liquid-glass PDF reader for Windows, built with Electron.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app from source |
| `npm run dist` | Builds the installer into `dist\GlassReader-Setup-<version>.exe` |
| `npm run icon` | Redraws `build\icon.png` |
| `npm run release -- 1.0.2` | Publishes version 1.0.2: builds, pushes and creates the GitHub release |

## How auto-updates work

The installed app checks GitHub Releases for a newer version 4 seconds after it starts and then every 4 hours.
It downloads the update in the background and shows a "Restart to update" bar. If you ignore the bar, the update installs the next time the app closes.

Updates come from https://github.com/lightiningblast/glass-reader/releases. The repo must stay public.

### Releasing an update

Make your changes, then run, with a version number higher than the last one:

```powershell
npm run release -- 1.0.2
```

This sets the version, builds the installer, commits and pushes, and publishes the GitHub release.
It uses the GitHub CLI (`gh`), which must be signed in (`gh auth status`).
Installed copies pick up the update on their next check.

## Notes

- The installer isn't code-signed, so Windows SmartScreen warns on first run. Click **More info**, then **Run anyway**.
  A code-signing certificate removes the warning.
- The app's page is in `src\index.html`. The PDF engine is copied into `src\vendor` on `npm install`.
