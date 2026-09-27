Pocket Delve dev tools (sims + Codex). Not part of the game.

Setup (from this folder):
  1. Copy the game to a scratch copy:   robocopy ..\web pd\web /E
     and a save to test:                 copy %APPDATA%\PocketDelve\save.json pd\web\save_live.json
  2. Start the server:                   python serve.py 8765        (serves pd\web; POST /save/<name> writes a file there)

Background sim of a save (silent, fast mode):
  python simfile.py stuck_sim.js       (reads save_live.json, writes progress to pd\web\stuck_progress.json every 15 sim-min)

Codex (reference page, published at https://claude.ai/artifact/MPt6Bc3Ns4hePnj4MrRdv3):
  set PYTHONIOENCODING=utf-8
  python simfile.py extract.js > game_data.json
  python build_ref.py                  (writes pocket_delve_codex.html)

Discord zone pictures (discord\zones\<slug>.png, 512x512: background + Lord + hero):
  python zone_art.py                   makes pictures for zones that don't have one (the git pre-commit hook runs this)
  python zone_art.py --all             redraws every zone (after changing a zone's look or Lord)
  The game links them from raw.githubusercontent.com, so they show on Discord once pushed.

Sim rules of thumb:
  - Fast mode: simFast = true; G.settings.sound = false; simulate(60, 0.1) per sim-minute (~3.7x faster, same results).
  - A hidden/background window triggers goAway() (farm-only): override goAway = () => {} first.
  - Fake the clock (Date.now) so expeditions and research advance.
sim_snapshot_17h.json = a fresh-game sim at 17.4h (floor 1076), used for chest comparisons.
