# Pocket Delve

A tiny idle dungeon crawler that lives in the corner of your screen. It's an always-on-top pixel window where your hero fights through floors, zones and bosses while you get on with other things.

## Play

You need Windows 10/11 and [Python 3.9+](https://www.python.org/downloads/). When you install Python, tick "Add Python to PATH".

1. Download this repo: the green **Code** button, then **Download ZIP**. Unzip it.
2. Open a terminal in the folder and install the one dependency:
   ```
   pip install -r requirements.txt
   ```
3. Double-click **PocketDelve.pyw** to play. You can also run `python app.py`.

Your save is stored in `%APPDATA%\PocketDelve\save.json`, and backups are kept next to it.

## Updating

Download the new version and replace the old files. Your save lives in `%APPDATA%`, not in the game folder, so it carries over.

## What's in here

- `app.py`: the desktop window (pywebview). Handles saving, window size, always-on-top and corner snapping.
- `web/`: the game itself (`game.js` engine, `data.js` content, `style.css`).
- `tools/`: dev scripts for balance simulations and the Codex reference page. See `tools/README.txt`.
- `CHANGELOG.md`: what's new.

The pixel font is [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans), used under the SIL Open Font License (`web/fonts/OFL.txt`).
