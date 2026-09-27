// Runs a copy of the user's save forward (their own settings and automation) and reports where progress stalls.
// Loaded by simfile.py in a hidden window. Posts progress to /save/stuck_progress.json every 15 sim-minutes.
(() => {
  goAway = () => {}; ui.away = null;  // (a hidden window would otherwise switch to farm-only "away" mode)
  const get = p => { const x = new XMLHttpRequest(); x.open('GET', p, false); x.send(); return x.responseText; };
  const put = (p, o) => { const x = new XMLHttpRequest(); x.open('POST', '/save/' + p, false); x.send(JSON.stringify(o)); };
  applyLoaded(get('save_live.json')); initRun(); G.settings.sound = false; simFast = true;  // (⚡ silent fast sim)
  const note = G.pendingNote5 || null;
  let clock = G.lastSave || 1.8e12; const realNow = Date.now; Date.now = () => clock;  // (sim clock, so expeditions & research run)
  const R = { note, start: { floor: G.floor, best: G.bestFloor, rebirths: G.rebirths, essence: G.essence, autoRebirth: G.settings.autoRebirth, rebirthStuck: G.settings.rebirthStuck }, log: [], done: false };
  const HOURS = 6;
  let lastBest = G.bestFloor, lastBestMin = 0, deaths0 = G.stats.deaths || 0;
  R.longest = { floor: G.bestFloor, mins: 0 };
  for (let m = 1; m <= HOURS * 60; m++) {
    simulate(60, 0.1); clock += 60000;
    automation();
    if (featureOn('exped')) { for (let i = G.exped.length - 1; i >= 0; i--) if (Date.now() >= G.exped[i].end) collectExpedition(i); for (const p of petsOwned()) if (!petAway(p) && G.exped.length < expSlots()) sendExpedition(p, 'hunt'); }
    if (G.bestFloor > lastBest) { const stall = m - lastBestMin; if (stall > R.longest.mins) R.longest = { floor: lastBest, mins: stall }; lastBest = G.bestFloor; lastBestMin = m; }
    if (m % 15 === 0) {
      R.log.push(`${(m / 60).toFixed(2)}h: floor ${G.floor}, this run's best ${G.maxFloor}, all-time best ${G.bestFloor}, rebirths ${G.rebirths}, falls ${(G.stats.deaths || 0) - deaths0}`);
      R.minutes = m; R.bestFloorLastRaisedAtMin = lastBestMin; R.essence = G.essence;
      put('stuck_progress.json', R);
    }
  }
  R.done = true; Date.now = realNow; put('stuck_progress.json', R);
  return 'ok';
})()
