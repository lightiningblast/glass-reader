# Glass Reader

A liquid-glass PDF reader for Windows, built with Electron.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app from source |
| `npm run dist` | Builds the installer into `dist\GlassReader-Setup-<version>.exe` |
| `npm run icon` | Redraws `build\icon.png` |
| `npm run release` | Builds and uploads a new version to GitHub Releases (auto-update) |

## How auto-updates work

The installed app checks GitHub Releases for a newer version 4 seconds after it starts and then every 4 hours.
It downloads the update in the background and shows a "Restart to update" bar. If you ignore the bar, the update installs the next time the app closes.

### One-time setup

1. Create a **public** GitHub repository named `glass-reader` under `lightiningblast` (the app looks for updates at github.com/lightiningblast/glass-reader).
2. Create a GitHub personal access token with the `repo` scope.

### Releasing an update

1. Raise `"version"` in `package.json`, for example `1.0.0` to `1.0.1`.
2. In PowerShell, run:

   ```powershell
   $env:GH_TOKEN = "<your token>"
   npm run release
   ```

3. On GitHub, open the draft release that was created and click **Publish release**.

Installed copies pick up the update on their next check.

## Notes

- The installer isn't code-signed, so Windows SmartScreen warns on first run. Click **More info**, then **Run anyway**.
  A code-signing certificate removes the warning.
- The app's page is in `src\index.html`. The PDF engine is copied into `src\vendor` on `npm install`.
