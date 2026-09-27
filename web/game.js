'use strict';
// ============================================================
//  Pocket Delve — engine
// ============================================================
const SAVE_KEY = 'pocketdelve_save_v1';
let G = null;            // persistent state
let RT = null;           // runtime battle state (not saved)
let MAIN = null;         // 🏁 during a challenge run: your normal save, parked (G is then the challenge's fresh game)
const VIEW = { w: 300, h: 110, s: 2, ground: 100 };
const ui = { panel: null, dirty: true, lastRender: 0, pointerDown: false, confirm: null };
// "while you were busy" recap: a snapshot from the last time the mouse was over the window
const recap = { snap: null, best: null, lastSeen: 0 };
const RECAP_AFTER = 5 * 60;  // seconds without the mouse over the window before a recap is shown
let statCache = null, headless = false;
// ⚡ fast sim mode (balance sims): no sound, popups, log text, floaters or effects, and golden cookies are eaten at once.
// Unlike `headless` it keeps treasure chests and cookies, which are a big part of the loot. Use with simulate(secs, 0.1).
let simFast = false;

// ---------------- utils ----------------
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  n = Number(n) || 0;
  if (Math.abs(n) < 1000) return Math.abs(n) < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  // Settings → scientific numbers: 1.23e15 instead of 1.23Qa (from a million up)
  if (G && G.settings && G.settings.sci && Math.abs(n) >= 1e6) { const [m, x] = n.toExponential(2).split('e'); return `${m}e${+x}`; }
  const e = Math.floor(Math.log10(Math.abs(n)) / 3);
  if (e >= SUF.length) { const [m, x] = n.toExponential(2).split('e'); return `${m}e${+x}`; }
  const v = n / Math.pow(1000, e);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUF[e];
}
function fmtTime(sec) { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${sec % 60}s` : `${sec}s`; }

// counters for achievements: bump('crits') or bump('traitKills', 'elite')
function bump(k, id) {
  const s = G.stats;
  if (id === undefined) s[k] = (s[k] || 0) + 1;
  else { s[k] = s[k] || {}; s[k][id] = (s[k][id] || 0) + 1; }
}

// ---------------- state ----------------
function newGame() {
  return {
    v: 2, itemScale: COMBAT_VERSION, rarityV: RARITY_VERSION, econ: ECON_VERSION, gold: 0, souls: 0, floor: 1, maxFloor: 1, bestFloor: 1, farm: false, farmT: 0,
    hero: { lvl: 1, xp: 0, gear: Object.fromEntries(Object.keys(SLOTS).map(k => [k, null])) },
    forge: Object.fromEntries(Object.keys(SLOTS).map(k => [k, 0])), chestsBought: 0,  // ⚒ Forge (see FORGE)
    nid: 1, perks: Object.fromEntries(Object.keys(PERKS).map(k => [k, 0])),
    upg: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])), buffs: [],
    // skills are learned by hero level (SKILLS[k].lvl); on = player's toggle
    skills: Object.fromEntries(Object.keys(SKILLS).map(k => [k, { on: true }])),
    rebirths: 0, settings: { onTop: true, compact: false, mini: false, size: 'medium', autoUpg: false, autoForge: false, autoRebirth: false, rebirthStuck: 5, autoPerks: true,
      // loot notifications: minimum rarity (99 = off) + modifier toggle, for equipped and sold items
      nEqR: 3, nEqMod: true, nSoldR: 6, nSoldMod: true,
      sound: false, volume: 0.5, sci: false, mute: {}, buyMode: 1, fade: 100, clickThrough: false, corner: 'br' },
    stats: { kills: 0, bossKills: 0, items: 0, equipped: 0, gold: 0, time: 0, cookies: 0, chests: 0, amulets: 0, bestR: 0, bestAm: -1, maxLvl: 1 }, rates: { gold: 0, xp: 0, kills: 0 },
    lastSave: Date.now(), chestT: 90, cookieT: 150, stuckT: 0, log: [],
    finds: [],  // 🏆 catalogue of extremely rare drops, kept for the whole save (survives rebirths)
    amulet: null,  // 📿 the worn amulet (kept through rebirths)
    amulet2: null,  // 📿 second amulet (Twin Chains relic)
    gems: 0, gemFloor: 0, skillRank: {}, relics: {}, gemsV: GEMS.version,  // 💎 gems; gemFloor = deepest boss floor already paid out
    petsFound: {}, bestiary: {}, bounty: null, scrap: 0, scrapV: SCRAP.version, stash: [],  // 🎒 stash = kept items  // 🔩 scrap = Forge material from sold Rare+ items  // 🐾 pets from boss drops · 📖 kills per monster type · 📅 today's bounties
    ach: {},  // 🏅 achievement id → time earned
    cos: { dye: 'default', helm: 'none', cape: 'none', weapon: 'default', aura: 'none', pet: 'none' },  // 🎨 wardrobe picks
    seen: {},  // unlock announcements already shown (upgrades, perks, features, skills)
    history: [], runStart: 0,  // past runs for the Stats panel; runStart = stats.time when this run began
    bountyV: BOUNTY_VERSION,
    insight: 0, insightV: 1, lab: { done: {}, active: [] },  // 🧪 Laboratory (active: [{ id, prog: seconds researched }])
    exped: [], petXp: {},  // 🐾 expeditions away ({ pet, kind, start, end }) and each pet's experience
    oath: null, oathXp: {},  // ⚜ the Oath sworn for this run, and mastery xp per Oath
    event: null, eventT: 20 * 60,  // 🌍 the running world event ({ id, t: seconds left }) and seconds of play until the next
    stardust: 0, stars: {}, starFloor: 0, starV: 1,  // ✧ Constellations (starFloor = deepest floor that paid Stardust)
    essence: 0, awakenings: 0, awakenBase: 0, essV: AWAKEN.version,  // 🌅 Awakening (awakenBase = souls earned at the last one)
    bossClears: {},  // 🔒 boss floor → times cleared this run (farming stops at BOSS_FARM_MAX)
    fate: {},  // 🌠 items dropped since the last one of each jackpot tier (see FATE)
    chal: { done: {}, best: {} },  // 🏁 challenge runs beaten (id → time) and the best floor reached in each
    rush: { last: 0 },  // ☠ when the last Boss Rush started (it has a cooldown)
  };
}

// ---------------- stats ----------------
function computeStats(gear) {
  const a = Object.fromEntries(Object.keys(AFFIXES).map(k => [k, 0]));
  let atk = HERO.atk, hp = HERO.hp;
  for (const s in gear) {
    const it = gear[s]; if (!it) continue;
    const fm = forgeMult(s);  // ⚒ Reinforce level of this slot
    atk += (it.atk || 0) * fm; hp += (it.hp || 0) * fm;
    for (const k in it.aff) if (k in a) a[k] += it.aff[k];
  }
  // gold upgrades that add to gear stats (Plating, Evasion, …)
  for (const k in UPGRADES) if (UPGRADES[k].add) for (const s in UPGRADES[k].add) a[s] += UPGRADES[k].add[s] * baseLv(k);
  // 🐾 worn pet and 🛡 set bonuses add gear stats too
  const petFx = cosOf('pet').fx || {}, pm = 1 + 0.1 * petLvl(G.cos && G.cos.pet);  // (🐾 +10% per pet level)
  for (const k in petFx) if (k in a) a[k] += petFx[k] * pm;
  const sets = setCounts(gear);
  const sm = labMult('sets');  // (🛡 Set Theory research)
  for (const [id, n] of Object.entries(sets)) for (const tier of SET_TIERS) if (n >= tier && GEAR_SETS[id][tier]) for (const k in GEAR_SETS[id][tier]) a[k] += GEAR_SETS[id][tier][k] * sm;
  const zf = zoneFx(G.floor), zh = zf.hero || {};  // 🌍 this zone's rule
  const lm = cs(1 + 0.1 * (G.hero.lvl - 1)), soul = soulMult(), u = G.upg, b = buffMult, um = upgMult, am = amuletMult, ms = masteryMult, ach = achMult();
  // attacks per second are capped; attack speed beyond the cap is split between extra health and damage
  const rawSpd = HERO.spd * (1 + a.spd / 100) * um('speed') * b('spd') * am('spd') * (zh.spd || 1), spd = Math.min(ATTACK_SPEED_CAP, rawSpd), over = cs(rawSpd / spd);
  // crit chance past 100% turns into crit damage
  const critRaw = HERO.crit + a.crit + baseLv('critChance') + (zh.crit || 0), critOver = Math.max(0, critRaw - 100);
  const st = {
    zi: zoneIndex(G.floor), heal: (zh.heal || 1) * chalFx('heal') * starMult('heal') * oathMult('heal'), dot: zh.dot || 0, miss: zh.miss || 0, sets,
    atk: atk * lm * soul * ach * (1 + a.atkP / 100) * um('damage') * b('atk') * am('atk') * ms('atk') * (zh.atk || 1) * Math.pow(over, 1 - OVERFLOW_HP_SHARE) * chalBonus('atk') * starMult('atk') * essPower() * labMult('atk') * oathMult('atk') * gritMult(),
    hp: hp * lm * soul * ach * (1 + a.hpP / 100) * um('health') * am('hp') * ms('hp') * Math.pow(over, OVERFLOW_HP_SHARE) * chalBonus('hp') * chalFx('hp') * starMult('hp') * essPower() * labMult('hp') * oathMult('hp') * gritMult(), spdOver: over,
    crit: chalRule('noCrit') ? 0 : Math.min(100, critRaw), critOver: chalRule('noCrit') ? 0 : critOver,  // (🔨 Blunt challenge: no crits)
    critD: (CRIT_BASE + a.critD) * (1 + critOver / 100) * um('critDmg') * am('critD') * ms('critD') * starMult('critD'),
    spd, leech: Math.min(AFFIXES.leech.cap, a.leech + 0.5 * baseLv('leech')),  // lifesteal is capped
    gold: a.gold, xp: a.xp + 30 * G.perks.scholar, loot: a.loot + 20 * G.perks.hunter,
  };
  // gear (and gold-upgrade) stats, clamped to their caps
  for (const k of ['dodge', 'armor', 'regen', 'multi', 'splash', 'bossDmg', 'soulFind'])
    st[k] = AFFIXES[k].cap ? Math.min(AFFIXES[k].cap, a[k]) : a[k];
  const zr = zf.reward || {};
  st.goldMult = (1 + st.gold / 100) * um('gold') * b('gold') * am('gold') * ach * ms('gold') * (hasRelic('midas') ? 1.5 : 1) * (zr.gold || 1) * chalBonus('gold') * chalFx('gold') * starMult('gold') * oathMult('gold') * eventFx('gold');
  st.xpMult = (1 + st.xp / 100) * um('xp') * b('xp') * perkCompound('scholar') * am('xp') * (zr.xp || 1) * chalBonus('xp') * starMult('xp') * oathMult('xp') * eventFx('xp');
  st.lootMult = (1 + st.loot / 100) * um('loot') * b('loot') * perkCompound('hunter') * am('loot') * chalBonus('loot') * starMult('loot') * oathMult('loot') * eventFx('loot');
  st.bossMult = (1 + st.bossDmg / 100) * am('boss') * ms('boss') * chalBonus('boss') * starMult('boss') * oathMult('boss') * b('boss');  // (👹 Giant cookie)
  st.dps = st.atk * st.spd * (1 + st.crit / 100 * st.critD / 100);
  return st;
}
// compounding upgrades: mult ^ level (a capped upgrade's levels stop at its max; the rest are Mastery)
const baseLv = k => Math.min(G.upg[k] || 0, UPGRADES[k].max || Infinity);
// balance knobs (let: the sim switches them to compare): additive = Greed/Wisdom use their flat `lin` %;
// every `stepEvery` levels an upgrade's price is ×stepMult on top of its normal growth
let BAL = { additive: true, stepEvery: 25, stepMult: 2 };
const upgMult = k => { const U = UPGRADES[k]; return BAL.additive && U.lin ? 1 + U.lin * baseLv(k) : Math.pow(U.mult, baseLv(k)); };
const masteryLv = k => UPGRADES[k].max ? Math.max(0, (G.upg[k] || 0) - UPGRADES[k].max) : 0;
// ✪ Mastery: every mastered level of every upgrade that feeds this stat
function masteryMult(stat) {
  let m = 1;
  for (const k in UPGRADES) { const M = UPGRADES[k].mastery; if (M && M[stat] && G.upg[k] > UPGRADES[k].max) m *= Math.pow(M[stat], masteryLv(k)); }
  return m;
}
// 📿 the worn amulet's bonus to a stat (both amulets with Twin Chains)
const amuletMult = stat => ((G.amulet && G.amulet.fx[stat]) || 1) * ((G.relics.twin && G.amulet2 && G.amulet2.fx[stat]) || 1);
// 💎 gems
const hasRelic = k => !!(G.relics && G.relics[k]);
// 🏁 challenge runs: the active rule (inside a challenge) and the rewards already won (on your normal save)
const chalDef = () => G && G.challenge && CHALLENGES[G.challenge.id];
const chalFx = k => { const C = chalDef(); return C && C.fx[k] != null ? C.fx[k] : 1; };
const chalRule = k => { const C = chalDef(); return !!(C && C.fx[k]); };
// 💪 Grit (challenge runs only, since they can't rebirth past a wall): after GRIT.after seconds without a new floor,
// +GRIT.per damage & health for every further minute stuck (at most GRIT.max levels). A new floor resets it.
// (sims: without it the same challenge took 30 min or stalled a whole hour at the floor-20 Lord, on gear luck alone)
const GRIT = { after: 120, per: 0.1, max: 20 };
const gritLvl = () => G.challenge ? clamp(Math.floor(((G.stuckT || 0) - GRIT.after) / 60) + 1, 0, GRIT.max) : 0;
const gritMult = () => 1 + GRIT.per * gritLvl();
// 🧪 finished research: × of every finished project's effect on `k` (labAdd: the additive ones, like slots)
function labMult(k) { let m = 1; for (const id in (G.lab && G.lab.done) || {}) { const f = RESEARCH[id] && RESEARCH[id].fx[k]; if (f) m *= f; } return m; }
function labAdd(k) { let a = 0; for (const id in (G.lab && G.lab.done) || {}) { const f = RESEARCH[id] && RESEARCH[id].fx[k]; if (f) a += f; } return a; }
const hasLab = k => labAdd(k) > 0;
// 🌍 the running world event's effect on `k` (1 = none)
const eventDef = () => G.event && WORLD_EVENTS[G.event.id];
const eventFx = k => { const E = eventDef(); return E && E.fx[k] != null ? E.fx[k] : 1; };
// ⚜ Oaths: mastery level, and the sworn Oath's × on `k` (upside grows with mastery, downside doesn't)
const oathLvl = k => Math.min(OATH.max, Math.floor(Math.sqrt(((G.oathXp || {})[k] || 0) / 10)));
function oathMult(k) {
  const O = G.oath && OATHS[G.oath]; if (!O) return 1;
  let m = 1;
  if (O.up[k]) m *= O.up[k] * (1 + OATH.per * oathLvl(G.oath));
  if (O.down[k]) m *= O.down[k];
  return m;
}
// ✧ Constellations: × of every lit star's effect on `k` (starAdd: the additive ones, like offline efficiency)
function starMult(k) {
  let m = 1;
  for (const [id, n] of Object.entries(G.stars || {})) { const C = CONSTELLATIONS[id]; if (C) for (let i = 0; i < n; i++) if (C.nodes[i][k]) m *= C.nodes[i][k]; }
  return m;
}
function starAdd(k) {
  let a = 0;
  for (const [id, n] of Object.entries(G.stars || {})) { const C = CONSTELLATIONS[id]; if (C) for (let i = 0; i < n; i++) a += C.nodes[i][k] || 0; }
  return a;
}
const starCost = id => CONSTELLATIONS[id].base * Math.pow(2, (G.stars || {})[id] || 0);
// Stardust for beating floor f the first time ever: laps done there, ×STAR.boss on boss floors (0 on the first lap)
const starFor = f => zoneTier(f) * (isBossFloor(f) ? STAR.boss : 1);
function gainDust(n, x) {
  n = Math.round(n * starMult('dust') * labMult('dust') * eventFx('dust') * oathMult('dust')); if (n <= 0) return;  // (🕯 Pilgrim)
  G.stardust = (G.stardust || 0) + n; G.stats.dustEarned = (G.stats.dustEarned || 0) + n;
  if (x != null) floater(x, VIEW.ground - 24 * VIEW.s, `+${fmt(n)}✧`, '#e1bee7', true);
  ui.dirty = true;
}
function buyStar(id) {
  const C = CONSTELLATIONS[id], n = (G.stars || {})[id] || 0;
  if (!C || n >= C.nodes.length || (G.stardust || 0) < starCost(id) || !featureOn('stars')) return;
  const before = heroStats().hp;
  G.stardust -= starCost(id); G.stars = G.stars || {}; G.stars[id] = n + 1; dirtyStats();
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  addLog(`✧ Lit a star in ${C.name}: ${starFxText(C.nodes[n])}`);
}
const starFxText = fx => Object.entries(fx).map(([k, v]) => k === 'offline' ? `+${v * 100}% ${STAR_FX_NAMES[k]}` : `×${v} ${STAR_FX_NAMES[k]}`).join(', ');
// 🌅 Awakening / Essence (its size sets the bonuses; only the 🔷 Essence Chest spends it)
const essence = () => G.essence || 0;
const essPower = () => 1 + AWAKEN.power * essence();       // damage & health
const essSouls = () => 1 + AWAKEN.souls * essence();       // souls from rebirths
// Essence reaches the millions: shown abbreviated (798K, 1.23M) with the exact number on hover
const essHtml = n => `<span title="${Math.round(n).toLocaleString('en-US')} Essence">${fmt(n)}</span>`;
const perkMax = k => { const P = PERKS[k]; if (!P.max) return 0; const c = AWAKEN.caps[k]; return P.max + (c ? Math.min(c[1], Math.floor(essence() * c[0])) : 0); };
// souls counted toward the next Awakening: earned since the last one, plus what rebirthing now would pay
const awakenSouls = () => Math.max(0, (G.stats.soulsEarned || 0) - (G.awakenBase || 0)) + soulsFor(G.maxFloor);
// (souls are counted without Essence's own soul bonus: that bonus used to feed straight into the next Awakening, so Essence
// snowballed to ~800K by lap 5)
const essenceGain = () => Math.floor(Math.pow(awakenSouls() / essSouls() / AWAKEN.per, AWAKEN.exp) * starMult('essence'));
function awaken() {
  const gain = essenceGain(); if (!gain || !featureOn('awaken') || G.challenge || (RT && RT.rush)) return;
  G.essence = essence() + gain; G.awakenings = (G.awakenings || 0) + 1; G.awakenBase = G.stats.soulsEarned || 0;
  G.souls = 0; for (const k in G.perks) G.perks[k] = 0;
  // a fresh run, like a rebirth that pays no souls (upgrades all go: Head Start is gone too)
  G.floor = 1; G.maxFloor = 1; G.chestsBought = 0; G.chestRun = {}; G.farm = false; G.farmT = 0; G.stuckT = 0; G.bossClears = {};
  G.hero.lvl = 1; G.hero.xp = 0; G.gold = 0; for (const k in G.upg) G.upg[k] = 0; for (const s in G.forge) G.forge[s] = 0;
  G.rates = { gold: 0, xp: 0, kills: 0 };  // (see rebirth: chests & cookies pay minutes of this)
  G.runStart = G.stats.time; paceSamples.length = 0; ui.confirm = null;
  dirtyStats(); initRun();
  addLog(`🌅 Awakening #${G.awakenings}: +${essHtml(gain)} Essence (${essHtml(essence())} in all)`); sfx('ach');
  if (!headless) showModal(`<b class="lapt">🌅 Awakened!</b><div>+${essHtml(gain)} Essence (${essHtml(essence())} in all)</div>
    <div>For good: <b class="up">×${fmt(essSouls())} souls</b> from rebirths, <b class="up">×${fmt(essPower())} damage & health</b>${Object.keys(AWAKEN.caps).some(k => perkMax(k) > PERKS[k].max) ? ', higher perk caps' : ''}.</div>
    <div class="dim small">Your souls, perks and run started over. Everything else is still yours.</div><button data-act="closeModal">Begin again</button>`);
}
// ---------------- 🧪 Insight & the Laboratory ----------------
function gainInsight(n, x) {
  if (!featureOn('lab')) return;
  n = Math.round(n * labMult('insight') * eventFx('insight') * oathMult('insight')); if (n <= 0) return;  // (🕯 Pilgrim)
  G.insight = (G.insight || 0) + n; G.stats.insightEarned = (G.stats.insightEarned || 0) + n;
  if (x != null) floater(x, VIEW.ground - 28 * VIEW.s, `+${fmt(n)}🧪`, '#80deea', true);
  ui.dirty = true;
}
const labSlots = () => 1 + labAdd('labSlots');
const researching = id => ((G.lab && G.lab.active) || []).some(a => a.id === id);
function startResearch(id) {
  const R = RESEARCH[id], L = G.lab;
  if (!R || !featureOn('lab') || G.challenge || L.done[id] || researching(id) || L.active.length >= labSlots() || (G.insight || 0) < R.cost) return;
  G.insight -= R.cost; L.active.push({ id, prog: 0 }); addLog(`🧪 Started researching ${R.name}`); ui.dirty = true;
}
function cancelResearch(id) {  // (refunds the Insight; the time spent is lost)
  const L = G.lab, a = L.active.find(x => x.id === id); if (!a) return;
  L.active = L.active.filter(x => x !== a); G.insight += RESEARCH[id].cost; ui.dirty = true;
}
// research runs in real time (also while the game is closed, and while you're in a challenge run: it's your save's lab)
function labTick(sec) {
  const g = MAIN || G, L = g.lab; if (!L || !L.active.length) return;
  const speed = G === g ? eventFx('lab') : 1;
  for (const a of L.active.slice()) {
    a.prog += sec * speed;
    const R = RESEARCH[a.id];
    if (R && a.prog >= R.hours * 3600) {
      L.active = L.active.filter(x => x !== a); L.done[a.id] = Date.now();
      if (g === G) dirtyStats();
      toast(`🧪 Research done: <b>${R.icon} ${R.name}</b> <span class="dim">${R.desc}</span>`, '#80deea'); addLog(`🧪 Research done: ${R.name}`); sfx('ach');
    }
  }
  ui.dirty = true;
}
// ---------------- 🐾 Expeditions & pet levels ----------------
const petLvl = id => id && id !== 'none' ? Math.min(PET_MAX_LVL, Math.floor(Math.sqrt(((G.petXp || {})[id] || 0) / 2))) : 0;
const expSlots = () => EXPED.slots + labAdd('slots');
const petsOwned = () => Object.keys(COSMETICS.pet.items).slice(1).filter(cosUnlocked);
const petAway = id => (G.exped || []).some(e => e.pet === id);
function sendExpedition(pet, kind) {
  const E = EXPEDITIONS[kind];
  if (!E || !featureOn('exped') || G.challenge || !cosUnlocked(pet) || petAway(pet) || G.exped.length >= expSlots()) return false;
  if (G.cos.pet === pet) { G.cos.pet = 'none'; heroIconUrl = null; dirtyStats(); }  // (a pet away can't be worn)
  G.exped.push({ pet, kind, start: Date.now(), end: Date.now() + E.secs * 1000 }); ui.dirty = true;
  return true;
}
// what a trip brings back: scaled by laps, the pet's level and 🗺 Treasure Maps
function expRewards(e) {
  const E = EXPEDITIONS[e.kind], tier = zoneTier(G.bestFloor), m = labMult('expLoot') * (1 + 0.05 * petLvl(e.pet));
  return { gems: Math.round(E.gems * m), scrap: Math.round(E.scrap * (1 + tier) * m), insight: E.insight * m,
    dust: featureOn('stars') ? Math.round(E.dust * tier * m) : 0, items: Math.round(E.items * m), xp: E.xp };
}
function collectExpedition(i, again) {
  const e = G.exped[i]; if (!e || Date.now() < e.end) return;
  const r = expRewards(e), P = COSMETICS.pet.items[e.pet], lv0 = petLvl(e.pet);
  G.exped.splice(i, 1);
  gainGems(r.gems); G.scrap = (G.scrap || 0) + r.scrap; gainInsight(r.insight); if (r.dust) gainDust(r.dust);
  for (let k = 0; k < r.items; k++) gainItem(makeItem(G.bestFloor, true));
  G.petXp[e.pet] = (G.petXp[e.pet] || 0) + r.xp; bump('expeditions'); if (e.kind === 'pilgrim') bump('pilgrimages');
  const up = petLvl(e.pet) > lv0 ? ` · <b class="up">${P.name} is now level ${petLvl(e.pet)}!</b>` : '';
  toast(`🐾 ${P.name} is back from the ${EXPEDITIONS[e.kind].name}: 💎${r.gems} · 🔩${fmt(r.scrap)}${featureOn('lab') ? ` · 🧪${fmt(Math.round(r.insight * labMult('insight')))}` : ''}${r.dust ? ` · ✧${fmt(r.dust)}` : ''}${r.items ? ` · ${r.items} item${r.items > 1 ? 's' : ''}` : ''}${up}`, '#ffb3e6', 'pet');
  addLog(`🐾 ${P.name} came back from the ${EXPEDITIONS[e.kind].name}`);
  if (again) sendExpedition(e.pet, e.kind);
  ui.dirty = true;
}
// 🕊 Homing Pigeons: finished trips collect themselves and go again
function autoExpeditions() {
  if (!hasLab('autoExp') || G.challenge) return;
  for (let i = G.exped.length - 1; i >= 0; i--) if (Date.now() >= G.exped[i].end) collectExpedition(i, true);
}
// ---------------- ⚜ Oaths ----------------
// no Oath yet: swear one any time; changing it only early in a run (right after a rebirth)
const canSwear = () => featureOn('oath') && !G.challenge && (!G.oath || G.maxFloor <= OATH.pickUntil);
function swearOath(k) {
  if (!OATHS[k] || !canSwear() || G.oath === k) return;
  const before = heroStats().hp;
  G.oath = k; dirtyStats();
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  toast(`⚜ You swore the Oath of the <b style="color:${OATHS[k].color}">${OATHS[k].name}</b>`, OATHS[k].color); addLog(`⚜ Swore the ${OATHS[k].name} Oath`);
}
const oathText = (fx, lvl) => Object.entries(fx).map(([k, v]) => `×${fmt(v * (lvl == null ? 1 : 1 + OATH.per * lvl))} ${STAR_FX_NAMES[k] || k}`).join(', ');
// ---------------- 🌍 World events ----------------
function tickEvents(dt) {
  if (!featureOn('events') || G.challenge) return;
  if (G.event) {
    G.event.t -= dt;
    if (G.event.t <= 0) {
      const E = eventDef(); G.event = null; dirtyStats();
      G.eventT = rand(EVENT.every[0], EVENT.every[1]) * 60 / labMult('events');
      if (E) { toast(`${E.icon} ${E.name} is over`, E.color); addLog(`${E.icon} ${E.name} ended`); }
    }
    return;
  }
  G.eventT -= dt;
  if (G.eventT > 0) return;
  const id = pick(Object.keys(WORLD_EVENTS)), E = WORLD_EVENTS[id];
  G.event = { id, t: EVENT.secs }; bump('events'); bump('eventSeen', id); dirtyStats();
  toast(`${E.icon} <b>${E.name}!</b> <span class="dim">${E.desc} (10 min)</span>`, E.color); addLog(`${E.icon} World event: ${E.name}`); sfx('rare');
}
const canWear = it => { const C = chalDef(); return !C || C.fx.maxR == null || it.r <= C.fx.maxR; };  // 🧦 Rags
function chalBonus(k) {
  let m = 1;
  for (const id in (G.chal && G.chal.done) || {}) { const r = CHALLENGES[id] && CHALLENGES[id].reward; if (r && r[k]) m *= r[k]; }
  return m;
}
const skillRank = k => (G.skillRank && G.skillRank[k]) || 0;
// ranks 1–5: +15% each, ranks 6–10: +10% each; rank 10 evolves the skill (SKILL_EVO)
const skillPower = k => 1 + SKILL_RANKS.power * Math.min(5, skillRank(k)) + SKILL_RANKS.power2 * Math.max(0, skillRank(k) - 5);
const evolved = k => skillRank(k) >= SKILL_RANKS.max;
const rankCost = k => skillRank(k) < SKILL_RANKS.max ? SKILL_RANKS.cost[skillRank(k)] : Infinity;
function buySkillRank(k) {
  const c = rankCost(k); if (G.gems < c) return;
  G.gems -= c; G.skillRank[k] = skillRank(k) + 1; ui.dirty = true;
  if (evolved(k)) { const S = SKILLS[k], E = SKILL_EVO[k]; toast(`✦ <b style="color:${S.color}">${S.name}</b> evolved into <b>${E.name}</b>! <span class="dim">${E.desc}</span>`, S.color, 'skill'); addLog(`✦ ${S.name} evolved into ${E.name}`); sfx('ach'); }
}
function buyRelic(k) {
  if (hasRelic(k) || G.gems < RELICS[k].cost) return;
  G.gems -= RELICS[k].cost; G.relics[k] = Date.now(); dirtyStats();
  toast(`${RELICS[k].icon} Relic unlocked: ${RELICS[k].name}`, '#6fe3ff'); addLog(`💎 Bought relic ${RELICS[k].name}`);
}
function gainGems(n, why) {
  if (n <= 0) return;
  const first = !G.stats.gemsEarned;
  G.gems += n; G.stats.gemsEarned = (G.stats.gemsEarned || 0) + n; ui.dirty = true;
  if (first) toast('💎 Your first gem! Spend gems in 🛡 Hero → 💎', '#6fe3ff');
  if (n >= 1 && !headless) sfx('gem');
  else if (why) floater(heroX(), VIEW.ground - 22 * VIEW.s, `💎 +${n}`, '#6fe3ff', true);
}
// 🏅 +2% per achievement
const achCount = () => Object.keys(G.ach || {}).length;
const achMult = () => 1 + ACH_BONUS * achCount();
// gradual unlocks (by best floor ever reached)
const upgUnlocked = k => G.bestFloor >= (UPGRADES[k].at || 1);
const perkUnlocked = k => G.bestFloor >= (PERKS[k].at || 1) || G.perks[k] > 0;
// (a challenge run can't rebirth or start another mode; challenges open up after your first rebirth)
const featureOn = k => G.challenge && (k === 'rebirth' || k === 'rush' || k === 'challenges') ? false
  : k === 'rebirth' ? G.bestFloor >= FEATURES.rebirth.at || G.rebirths > 0 : k === 'challenges' ? G.rebirths > 0 : G.bestFloor >= FEATURES[k].at;
// active golden-cookie buffs multiply a stat while they last
function buffMult(stat) { let m = 1; for (const bf of G.buffs) if (bf.mult[stat]) m *= bf.mult[stat]; return m; }
// cached, and recomputed on entering a new zone (zone effects change your stats)
const heroStats = () => statCache && statCache.zi === zoneIndex(G.floor) ? statCache : (statCache = computeStats(G.hero.gear));
const zoneIndex = f => Math.floor((f - 1) / FLOORS_PER_ZONE) % ZONES.length;
const zoneFx = f => zoneOf(f).fx || {};
const setCounts = gear => { const c = {}; for (const s in gear) { const it = gear[s]; if (it && it.set && GEAR_SETS[it.set]) c[it.set] = (c[it.set] || 0) + 1; } return c; };
function dirtyStats() { statCache = null; ui.dirty = true; }
// how strong a set of stats is: effective damage × √(effective health) × a little for farming stats.
// Every gear stat counts: multistrike/splash/boss boost damage,
// dodge/armor multiply effective health, regen/lifesteal add sustain.
function rating(st) {
  const dmg = st.dps * (1 + st.multi / 100) * (1 + st.splash / 200) * (1 + st.bossDmg / 700);
  const ehp = st.hp / ((1 - st.dodge / 100) * (1 - st.armor / 100)) * (1 + st.regen / 20) * (1 + st.leech / 20);
  return dmg * Math.sqrt(ehp) * (1 + (st.gold + st.xp + st.loot + st.soulFind) / 400);
}
const skillCd = k => SKILLS[k].cd * labMult('cd');  // (📐 Battle Tactics)
const skillKnown = k => G.hero.lvl >= SKILLS[k].lvl;
const skillActive = k => skillKnown(k) && !!(G.skills[k] && G.skills[k].on) && !chalRule('noSkills');  // (🤐 Silence challenge)

// ---------------- floors & enemies ----------------
const zoneOf = f => ZONES[Math.floor((f - 1) / FLOORS_PER_ZONE) % ZONES.length];
const zoneTier = f => Math.floor((f - 1) / (FLOORS_PER_ZONE * ZONES.length));  // = laps completed (0 on the first lap)
const roman = n => { let s = ''; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s; };
const isBossFloor = f => f % 10 === 0;
function floorBase(f) {
  // upgrades compound, so enemies need to grow a bit faster than the hero's compounding power
  // monster damage: tuned so the hero's HP visibly drops in fights (a typical floor takes ~20% of it)
  // (retuned when item growth per floor went 1.13 → 1.08)
  // (compressed by COMBAT_SCALE: the uncompressed curve was hp ×1.202 / atk ×1.1645 per floor)
  // ENEMY_TOUGH: a flat difficulty boost that ramps in from TOUGH_START on floor 1, so the whole game is
  // harder by the same amount without the gap compounding deeper down
  // (health starts boosted; damage ramps in from normal, since early deaths come down to luck)
  const ramp = Math.min(1, (f - 1) / TOUGH_RAMP), tough = TOUGH_START + (ENEMY_TOUGH - TOUGH_START) * ramp, toughAtk = 1 + (ENEMY_TOUGH - 1) * ramp;
  // 🔁 every lap of the dungeon: monsters ×LAP.hp health and ×LAP.atk damage; rewards double
  const lap = zoneTier(f), lh = Math.pow(LAP.hp, lap), la = Math.pow(LAP.atk, lap) * Math.pow(ATK_EXTRA, Math.max(0, f - ATK_EXTRA_FROM)) * lapAtkRamp(f), lr = Math.pow(2, lap);
  return { hp: 16 * tough * lh * Math.pow(ENEMY_HP_GROWTH, f - 1) * chalFx('ehp') * eventFx('ehp'), atk: 6 * Math.pow(toughAtk, 0.8) * la * Math.pow(ENEMY_ATK_GROWTH, f - 1) * chalFx('eatk') * eventFx('eatk'), gold: 2 * lr * Math.pow(GOLD_FLOOR_GROWTH, f - 1), xp: 3 * lr * Math.pow(XP_FLOOR_GROWTH, f - 1) };
}
// ENEMY_TOUGH 2.5 → 3.5 alongside the stronger core upgrades (sim: without upgrades stuck ~F25, buying F~49 at 8 min)
let ENEMY_TOUGH = 3.5, TOUGH_RAMP = 40, TOUGH_START = 1.5;  // user found the early game too easy (sim: first wall ~floor 41, F~86 at 13 min)
const xpNeed = l => Math.floor(15 * Math.pow(XP_LEVEL_GROWTH, l - 1));
// Soul Power compounds (it used to add a flat +25%/level, which exponential perk costs made worthless)
const soulMult = () => Math.pow(cs(1.1), G.perks.soul);
// the flat perks' extra compounding multiplier
const perkCompound = k => Math.pow(PERK_COMPOUND, G.perks[k] || 0);
// enemies also grow to match Sharpen/Toughen being stronger than the old ×cs(1.1): each floor of depth pays for
// ln(1.025)/ln(1.101) ≈ 0.26 levels, so they get that much of the extra per level on top of the base curve
const UPG_COMP = Math.pow(CORE_UPG / cs(1.1), Math.log(GOLD_FLOOR_GROWTH) / Math.log(UPGRADES.damage.growth));
// HP_EXTRA: extra health growth per floor on top (user wanted floors harder; 1.004 ≈ ×1.5 health by floor 100, ×5 by 400)
// (1.004 → 1.008 in balance pass v2: sim variant C, runs of 15–70 min that each push ~50–250 floors deeper)
const HP_EXTRA = 1.008;
// ATK_EXTRA: extra monster damage per floor from ATK_EXTRA_FROM on (the first floors are fine; after that a few basic
// defense upgrades made the hero untouchable)
// (sim: at ×1.009 skipping defense upgrades roughly doubles deaths; with none, skipping defense was even safer)
let ATK_EXTRA = 1.009, ATK_EXTRA_FROM = 25;
// healing limits: lifesteal heals at most LEECH_RATE × lifesteal% of max health per second (25% lifesteal ≈ 6%/s);
// walking between floors heals WALK_HEAL of max health per second (was 40%)
let LEECH_RATE = 0.25, WALK_HEAL = 0.2;
// every lap, monster damage also grows faster per floor: lap k (0 = first) adds LAP_ATK_STEP × k per floor,
// so lap 2 is ×1.004 per floor extra, lap 3 ×1.008, … (each lap's floors keep the rate they were played at)
// (0.002 → 0.004 on request: the lap ramp should scale harder)
let LAP_ATK_STEP = 0.004;
function lapAtkRamp(f) {
  const L = FLOORS_PER_ZONE * ZONES.length, lap = zoneTier(f);
  let m = 1;
  for (let k = 1; k <= lap; k++) m *= Math.pow(1 + LAP_ATK_STEP * k, k < lap ? L : (f - 1) - lap * L);
  return m;
}
let ENEMY_HP_GROWTH = cs(1.202) * UPG_COMP * HP_EXTRA, ENEMY_ATK_GROWTH = cs(1.1645) * UPG_COMP;
const bossTime = () => 30 + 5 * G.perks.slayer;
// early floors retry much sooner (16s on floor 2, ≈40s on floor 10, the full 180s by floor ~57) so a death at
// the start means "buy an upgrade", not minutes of waiting
const retryTime = () => Math.min(10 + 3 * G.floor, [180, 90, 45, 20, 10][G.perks.relentless] || 10);
// souls grow exponentially with depth (×SOUL_FLOOR_GROWTH per floor on top of the base curve), far gentler than enemies
// (was ×1.025: user found deep rebirths paid out too much; ×1.02 roughly halves a floor-200 rebirth)
const SOUL_FLOOR_GROWTH = 1.017;  // (1.02 → 1.017 on request: a floor-200 rebirth pays ~60% of before)
const soulsFor = f => f < REBIRTH_MIN_FLOOR ? 0 : Math.floor(Math.pow((f - 20) / 2, 1.5) * Math.pow(SOUL_FLOOR_GROWTH, f - REBIRTH_MIN_FLOOR) * (1 + heroStats().soulFind / 100) * amuletMult('souls') * masteryMult('souls') * (hasRelic('lantern') ? 1.25 : 1) * chalBonus('souls') * starMult('souls') * essSouls() * labMult('souls') * oathMult('souls'));
// the first floors drop loot more often (×3 on floor 1, fading out by floor 60) so early gear changes a bit more
const earlyLoot = f => 1 + 2 * Math.max(0, 1 - f / 60);
const dropChance = (f, loot = 1) => Math.min(1, 0.07 * loot * earlyLoot(f) * heroStats().lootMult) * chalFx('loot');  // (🥀 Famine: fewer drops, same rarities)

// ---------------- runtime battle ----------------
const heroX = () => HERO.x * VIEW.s / 3;
function initRun() {
  RT = { hero: { hp: heroStats().hp, dead: false, atkT: 0, anim: 0, flash: 0 }, enemies: [], proj: [], fx: [], floaters: [],
    skillT: Object.fromEntries(Object.entries(SKILLS).map(([k, S]) => [k, S.cd - S.first])), warcryT: 0, whirl: null,
    phase: 'walk', walkT: 0.6, scroll: 0, queue: [], spawnT: 0, bossT: 0, isBoss: false, chest: null, cookie: null, lastMax: G.maxFloor, t: 0, acc: { gold: 0, xp: 0, kills: 0, t: 0 } };
}
const aliveEnemies = () => RT.enemies.filter(e => !e.dead);

function startFloor() {
  const f = G.floor, z = zoneOf(f), boss = isBossFloor(f);
  const n = waveSize(f);
  RT.queue = [];
  // ✨ now and then a new floor is a special stage
  // (🧭 Cartography: twice as often; some stages need a feature first, like the Forge for the Scrap Heap)
  RT.special = !boss && !replaying() && !G.farm && G.bestFloor >= 20 && Math.random() < SPECIAL_CHANCE * labMult('special') ? pick(Object.keys(SPECIAL_STAGES).filter(k => !SPECIAL_STAGES[k].req || featureOn(SPECIAL_STAGES[k].req))) : null;
  const SP = RT.special && SPECIAL_STAGES[RT.special];
  if (SP && SP.wave) for (let i = 0; i < SP.wave[1]; i++) RT.queue.push(SP.wave[0]);
  else for (let i = 0; i < n; i++) RT.queue.push(pick(z.mobs));
  if (SP) {
    RT.specialT = SP.secs || 0; bump('specials', RT.special);
    toast(`${SP.icon} <b>${SP.name}!</b> <span class="dim">${SP.desc}</span>`, SP.color); addLog(`${SP.icon} Found a ${SP.name} on floor ${f}`); sfx('rare');
  }
  const twin = boss && twinBossFloor(f);
  if (boss) RT.queue.push(...(twin ? ['BOSS:guard', 'BOSS:lord'] : [bossKind(f) === 'guard' ? 'BOSS:guard' : 'BOSS:lord']));
  RT.isBoss = boss; RT.twin = twin; RT.bossT = bossTime() * (twin ? 1.5 : 1); RT.phase = 'fight'; RT.spawnT = 0; RT.fightT = 0; RT.phoenixUsed = false; RT.hurt = false;
}
// each zone's Guardian is halfway through it, its Lord at the end; from the second lap the end floor has both
const bossKind = f => f % FLOORS_PER_ZONE === 0 ? 'lord' : 'guard';
const twinBossFloor = f => bossKind(f) === 'lord' && zoneTier(f) >= 1;
const bossOf = (f, kind) => kind === 'guard' ? zoneOf(f).guard : zoneOf(f).boss;
const bossLabel = f => twinBossFloor(f) ? `${zoneOf(f).guard.name} & ${zoneOf(f).boss.name}` : bossOf(f, bossKind(f)).name;
// ---- replay: floors below your all-time best go by much faster ----
let REPLAY_BONUS = 3;  // gold & XP multiplier while replaying
// replay pace: skipMax = most floors one quick clear can skip, blitzStep = seconds per Blitzed floor,
// spawn = seconds between monsters appearing, move = how much faster they walk in, walk = pause between floors
// (was 10 / 0.1 / 0.06 / 3 / 0.12; user found replays a little too fast — sim: re-climb ~35% slower)
let REPLAY = { skipMax: 5, blitzStep: 0.25, spawn: 0.12, move: 2, walk: 0.25 };
// loot (items & amulets, bosses included) on floors below your best: × blitz on Blitzed floors, × fight on fought ones.
// (user: re-climbing after a rebirth gave far too much loot. Sim on their save: floor 254 → 793 in 17 min dropped
// ~24k items, ~4× the normal rate: 14k from Blitz, 10k from fought replays, which spawn and walk in faster)
let REPLAY_LOOT = { blitz: 0.05, fight: 0.4 };
const replaying = () => !(RT && RT.rush) && G.floor < G.bestFloor;
// (🐜 Horde challenge / The Swarm event: twice as many)
const waveSize = f => isBossFloor(f) ? 2 : Math.round(Math.min(9, 3 + Math.floor(f / 8)) * chalFx('wave') * (G.challenge ? 1 : eventFx('wave')));
// Blitz: if the hero would one-shot the toughest monster on a replayed floor and shrug off its hits,
// the floor is cleared instantly (with full gold, XP and loot), about 4 floors per second (REPLAY.blitzStep)
function canBlitz() {
  if (!replaying() || G.farm) return false;
  const f = G.floor, b = floorBase(f), st = heroStats(), boss = isBossFloor(f);
  const toughest = b.hp * (boss ? 12 : 2.6), hardest = b.atk * (boss ? 2.2 : 1.4);
  return st.atk >= toughest && st.hp >= hardest * 10;
}
function blitzFloor() {
  const f = G.floor, b = floorBase(f), st = heroStats(), boss = isBossFloor(f), n = waveSize(f);
  const gold = b.gold * (n + (boss ? 15 : 0)) * st.goldMult * REPLAY_BONUS, xp = b.xp * (n + (boss ? 10 : 0)) * st.xpMult * REPLAY_BONUS;
  G.gold += gold; G.stats.gold += gold; G.stats.kills += n + (boss ? 1 : 0);
  RT.acc.gold += gold; RT.acc.xp += xp; RT.acc.kills += n;
  gainXp(xp);
  for (let i = 0; i < n; i++) countKill(pick(zoneOf(f).mobs));  // 📖 the blitzed monsters count for the bestiary
  const chance = dropChance(f) * REPLAY_LOOT.blitz, bl = REPLAY_LOOT.blitz;
  for (let i = 0; i < n; i++) if (Math.random() < chance) for (let k = itemsPerDrop(false); k > 0; k--) gainItem(makeItem(f, false));
  if (boss) {
    const zi = ZONES.indexOf(zoneOf(f)), kinds = twinBossFloor(f) ? ['guard', 'lord'] : [bossKind(f)];
    for (const kd of kinds) { G.stats.bossKills++; bump('bossZ', zi); bump(kd === 'guard' ? 'bossG' : 'bossL', zi); countKill(`boss:${zi}:${kd}`); if (Math.random() < PET_DROP) unlockRandomPet('A boss dropped a pet'); }
    if (kinds.length > 1) bump('twinKills');
    for (const kd of kinds) if (Math.random() < bl) { for (let k = itemsPerDrop(true); k > 0; k--) gainItem(makeItem(f, true)); maybeAmulet(); }
    if (f > (G.gemFloor || 0)) { gainGems(gemsForBoss(f), true); G.gemFloor = f; }
  }
  bump('blitzed');
  G.floor++; if (G.floor > G.maxFloor) G.maxFloor = G.floor;
  if (!headless && G.floor % 5 === 0) floater(heroX(), VIEW.ground - 18 * VIEW.s, `⏩ F${G.floor}`, '#7df9ff', true);
}
// a fast clear jumps ahead: the quicker the clear, the further (never past a boss floor or your best)
function replaySkip() {
  if (!replaying() || G.farm || RT.isBoss || RT.fightT > 2.5) return 0;
  let n = Math.min(REPLAY.skipMax, Math.floor(2.5 / Math.max(2.5 / REPLAY.skipMax, RT.fightT)), G.bestFloor - G.floor - 1);
  for (let i = 1; i <= n; i++) if (isBossFloor(G.floor + i)) { n = i - 1; break; }
  if (n <= 0) return 0;
  // pay out the skipped floors' gold & XP as if they'd been fought
  const st = heroStats();
  let gold = 0, xp = 0, kills = 0;
  for (let i = 1; i <= n; i++) { const f = G.floor + i, b = floorBase(f), k = waveSize(f); gold += b.gold * k; xp += b.xp * k; kills += k; }
  gold *= st.goldMult * REPLAY_BONUS; xp *= st.xpMult * REPLAY_BONUS;
  G.gold += gold; G.stats.gold += gold; G.stats.kills += kills;
  RT.acc.gold += gold; RT.acc.xp += xp; RT.acc.kills += kills;
  gainXp(xp);
  floater(heroX(), VIEW.ground - 20 * VIEW.s, `⏩ +${n} floors`, '#7df9ff', true);
  return n;
}
// chance a normal monster rolls a trait: none before floor 5, rising to 35% by floor ~100
const traitChance = f => f < 5 ? 0 : Math.min(0.35, 0.08 + f * 0.003);
const TRAIT_BY_ID = Object.fromEntries(TRAITS.map(t => [t.id, t]));
// a monster's traits: its main one, plus a second if it's a Champion
const hasTrait = (e, id) => e.trait === id || e.trait2 === id;
function rollTrait() {
  let x = Math.random() * TRAITS.reduce((a, t) => a + t.w, 0);
  for (const t of TRAITS) { x -= t.w; if (x <= 0) return t; }
  return TRAITS[0];
}
// opts: { minion: true } for summoned/split copies (weaker, no trait), hpMult/reward/scale/x overrides
// the zone monsters come from: this floor's, or during a ☠ Boss Rush the zone of the boss being fought
const curZone = () => RT && RT.rush ? ZONES[RT.rush.zi] : zoneOf(G.floor);
function spawnEnemy(key, opts = {}) {
  const f = RT.rush ? RT.rush.f : G.floor, b = floorBase(f), tier = zoneTier(f), Z = curZone();
  // 🏟 Champion Arena: one of the zone's monsters as a mighty Champion
  if (key === 'CHAMP') { key = pick(Z.mobs); opts = Object.assign({}, opts, { champion: true, arena: true }); }
  let e;
  if (key.startsWith('BOSS')) {
    // Guardians are a bit weaker than Lords; a twin fight splits the toughness between the two
    const kind = key === 'BOSS:guard' ? 'guard' : 'lord', B = kind === 'guard' ? Z.guard : Z.boss, k = (kind === 'guard' ? 0.8 : 1) * (RT.twin ? 0.65 : 1);
    e = { name: B.name + (tier ? ' ' + roman(tier + 1) : ''), sprite: B.sprite, pal: B.pal, hp: b.hp * 12 * k, atk: b.atk * 2.2 * (RT.twin ? 0.75 : 1), spd: 0.7, move: 50, boss: true, bossKind: kind, scale: 2, gold: b.gold * 15 * k, xp: b.xp * 10 * k };
  } else {
    const d = ENEMIES[key], w = 0.6 + d.hp * 0.4;
    // even the slowest monsters shuffle in at a decent pace
    e = { key, name: d.name, sprite: d.sprite, pal: d.pal, hp: b.hp * d.hp, atk: b.atk * d.atk, spd: d.spd, move: Math.max(32, d.move) * 1.6, range: d.range, longRange: d.longRange, fly: d.fly, scale: 1, gold: b.gold * w, xp: b.xp * w, loot: 1 };
    const t = !opts.minion && (RT.special === 'gauntlet' ? TRAIT_BY_ID.elite : !d.harmless && (opts.champion || Math.random() < traitChance(f)) ? rollTrait() : null);  // ☠ Elite Gauntlet: all Elite
    if (t) {
      // 🏅 Champions (from lap 2, or the 🏟 Champion Arena): a second, different trait, tougher and richer
      let t2 = null;
      if (opts.champion || (tier >= CHAMPION.fromLap && RT.special !== 'gauntlet' && Math.random() < CHAMPION.chance)) { do t2 = rollTrait(); while (t2.id === t.id); }
      e.trait = t.id; e.trait2 = t2 && t2.id;
      e.name = t2 ? `Champion ${t.name} ${t2.name} ${e.name}` : `${t.name} ${e.name}`;
      for (const T of [t, t2]) {
        if (!T) continue;
        e.hp *= T.hp || 1; e.atk *= T.atk || 1; e.scale *= T.scale || 1;
        if (T.reward) { e.gold *= T.reward; e.xp *= T.reward; e.loot = (e.loot || 1) * T.reward; }
        if (T.id === 'bomber') { e.move *= 1.8; e.range = 0; e.longRange = false; }
        if (T.id === 'swift') { e.move *= 1.6; e.spd *= 1.6; }
        if (T.id === 'charger') e.charge = true;
      }
      if (t2) { e.champion = true; e.hp *= CHAMPION.hp; e.gold *= CHAMPION.reward; e.xp *= CHAMPION.reward; e.loot = (e.loot || 1) * CHAMPION.reward; e.scale = Math.min(2, e.scale * 1.15); }
      if (hasTrait(e, 'shielded')) e.shield = e.hp * 0.6;
      // 🔬 Monster Studies research: trait monsters pay more
      e.gold *= labMult('traitRw'); e.xp *= labMult('traitRw');
      e.traitT = rand(1, 2);
    }
    if (opts.minion) { e.hp *= opts.hpMult || 0.4; e.gold *= opts.reward || 0.3; e.xp *= opts.reward || 0.3; e.scale *= opts.scale || 0.8; e.minion = true; }
    if (opts.arena) { e.hp *= 6; e.atk *= 1.3; e.gold *= 5; e.xp *= 5; e.arena = true; e.scale = 2; e.name = e.name.replace(/^Champion /, 'Arena Champion '); }
  }
  // 🌍 zone rules for monsters
  const ze = (Z.fx || {}).enemy || {};
  e.hp *= ze.hp || 1; e.atk *= ze.atk || 1; e.spd *= ze.spd || 1;
  // ☠ boss ability, 📖 bestiary entry (and its damage bonus against this monster)
  if (e.boss) {
    const zi = ZONES.indexOf(Z);
    e.abs = bossAbilities(Z, e.bossKind, tier); e.ab = e.abs[0];
    e.abT = Object.fromEntries(e.abs.map((a, i) => [a, BOSS_ABILITIES[a].every ? BOSS_ABILITIES[a].every * (0.6 + 0.25 * i) : 0]));  // (staggered)
    e.beast = `boss:${zi}:${e.bossKind}`;
    if (eventFx('bossHp') > 1 && !RT.rush) { e.hp *= eventFx('bossHp'); }  // 🌑 Eclipse
  }
  else e.beast = e.key;
  e.bmult = bestiaryMult(e.beast);
  e.maxHp = e.hp; e.maxShield = e.shield || 0;
  e.x = opts.x != null ? opts.x : VIEW.w + 12 * VIEW.s * e.scale;
  e.atkT = Math.random() * 0.5; e.flash = 0; e.dead = 0; e.bob = Math.random() * 6; e.born = RT.t;
  RT.enemies.push(e);
  return e;
}
// ☠ boss abilities (see BOSS_ABILITIES)
// a boss's abilities: its own, plus one more per lap from lap 2 (up to 3), picked from EXTRA_AB by zone so each
// boss always has the same set
function bossAbilities(Z, kind, tier) {
  const own = kind === 'guard' ? Z.guardAb : Z.lordAb, abs = own ? [own] : [];
  const zi = Math.max(0, ZONES_DEFINED.indexOf(Z));
  for (let k = 1; k <= Math.min(2, tier); k++) {
    let i = (zi * 3 + (kind === 'guard' ? 1 : 0) + k * 4) % EXTRA_AB.length;
    while (abs.includes(EXTRA_AB[i])) i = (i + 1) % EXTRA_AB.length;
    abs.push(EXTRA_AB[i]);
  }
  return abs;
}
const AB_SAY = { summon: ['🔮 Summon!', '#b388ff'], shield: ['🛡 Stone Skin', '#64b5f6'], breath: ['🔥 Breath incoming!', '#ff7043'], curse: ['🕯 Curse!', '#b39ddb'],
  heal: ['💚 Regenerate', '#69f0ae'], slam: ['💥 Slam!', '#bcaaa4'], drain: ['🩸 Drain!', '#e53935'], frenzy: ['⚡ Frenzy!', '#fff176'], barrier: ['🔷 Barrier!', '#90caf9'], meteor: ['☄ Meteor incoming!', '#ffab40'] };
function bossTick(e, dt) {
  if (!e.boss || e.dead || RT.phase !== 'fight' || !e.abs || !e.abs.length) return;
  const s = VIEW.s, say = (t, c) => floater(e.x, VIEW.ground - 22 * s * e.scale / 2, t, c, true);
  e.immuneT = Math.max(0, (e.immuneT || 0) - dt);
  if (e.frenzyT > 0) { e.frenzyT -= dt; if (e.frenzyT <= 0) e.spd /= BOSS_ABILITIES.frenzy.spd; }
  // Breath / Meteor: a wind-up you can see coming, then a big hit (one at a time)
  if (e.windup > 0) {
    e.windup -= dt;
    if (e.windup <= 0) { const A = BOSS_ABILITIES[e.windAb]; hurtHero(e.atk * A.mult, e); if (A.stun) RT.hero.stun = Math.max(RT.hero.stun || 0, A.stun); fx('ring', heroX(), VIEW.ground - 6 * s, AB_SAY[e.windAb][1]); }
    return;
  }
  for (const ab of e.abs) {
    const A = BOSS_ABILITIES[ab];
    if (ab === 'enrage') {
      if (!e.enraged && e.hp < e.maxHp * A.below) { e.enraged = true; e.spd *= A.spd; e.atk *= A.atk; say('😡 ENRAGED', '#ff5252'); }
      continue;
    }
    e.abT[ab] = (e.abT[ab] || 0) - dt; if (e.abT[ab] > 0) continue;
    e.abT[ab] = A.every;
    const [txt, col] = AB_SAY[ab] || [A.name, '#ffffff'];
    if (ab === 'summon') for (let i = 0; i < A.n; i++) { const m = spawnEnemy(pick(curZone().mobs), { minion: true, x: e.x + (6 + 6 * i) * s }); m.name = 'Summoned ' + m.name; }
    else if (ab === 'shield') { e.shield = (e.shield || 0) + e.maxHp * A.pct; e.maxShield = Math.max(e.maxShield, e.shield); }
    else if (ab === 'breath' || ab === 'meteor') { e.windup = A.windup; e.windAb = ab; }
    else if (ab === 'curse') RT.curseT = A.secs;
    else if (ab === 'heal') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * A.pct);
    else if (ab === 'slam') { hurtHero(e.atk * A.mult, e); RT.hero.stun = Math.max(RT.hero.stun || 0, A.stun); }
    else if (ab === 'drain') { hurtHero(e.atk * A.mult, e); e.hp = Math.min(e.maxHp, e.hp + e.maxHp * A.pct); }
    else if (ab === 'frenzy') { if (!(e.frenzyT > 0)) e.spd *= A.spd; e.frenzyT = A.secs; }
    else if (ab === 'barrier') e.immuneT = A.secs;
    say(txt, col);
    break;  // one ability per tick, so two never land on the same frame
  }
}
// 📖 bestiary
const beastKills = k => (G.bestiary && G.bestiary[k]) || 0;
const beastTier = k => { const T = k.startsWith('boss:') ? BESTIARY.bossTiers : BESTIARY.tiers; let t = 0; while (t < T.length && beastKills(k) >= T[t]) t++; return t; };
// damage bonus against this monster: the % of every tier reached (bosses use the same % per tier), ×2 with the Monster Tome
function bestiaryMult(k) {
  const t = beastTier(k); let pct = 0;
  for (let i = 0; i < t; i++) pct += BESTIARY.dmg[i];
  return 1 + pct / 100 * (hasRelic('tome') ? 2 : 1) * labMult('beast');  // (🦴 Anatomy research: ×1.5)
}
function countKill(k) {
  if (!k) return;
  const before = beastTier(k);
  G.bestiary[k] = beastKills(k) + 1;
  const after = beastTier(k);
  if (after > before) {
    const boss = k.startsWith('boss:'), gems = (boss ? BESTIARY.bossGems : BESTIARY.gems)[after - 1] || 0;
    if (after > 1 || boss) toast(`📖 Bestiary: ${beastName(k)} tier ${after} (+${BESTIARY.dmg[after - 1]}% damage against it${gems ? `, 💎${gems}` : ''})`, '#c5e1a5', 'bestiary');
    gainGems(gems, true);
  }
}
const beastName = k => { if (!k.startsWith('boss:')) return (ENEMIES[k] || {}).name || k; const [, zi, kind] = k.split(':'); const z = ZONES[+zi]; return z ? (kind === 'guard' ? z.guard.name : z.boss.name) : k; };
// per-frame trait behaviour (summoner, regenerator)
function traitTick(e, dt) {
  if (!e.trait || e.dead || RT.phase !== 'fight') return;
  if (hasTrait(e, 'regen')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt);
  e.traitT -= dt;
  if (e.traitT > 0) return;
  if (hasTrait(e, 'summoner')) {
    e.traitT = 5;
    if (aliveEnemies().filter(o => o.summoner === e).length < 3) {
      const m = spawnEnemy(pick(curZone().mobs), { minion: true, x: e.x + 8 * VIEW.s });
      m.summoner = e; m.name = 'Summoned ' + m.name;
      floater(e.x, VIEW.ground - 16 * VIEW.s, '🔮', '#b388ff', true);
    }
  }
}
function heal(amt) {
  const h = RT.hero; if (h.dead) return;
  const a = Math.min(amt * heroStats().heal, heroStats().hp - h.hp);  // (zone effects can weaken healing)
  if (a > 0) h.hp += a;
}
// src = the monster that dealt the hit
function hurtHero(dmg, src) {
  const h = RT.hero; if (h.dead) return;
  const st = heroStats();
  if (st.dodge && Math.random() * 100 < st.dodge) { bump('dodges'); floater(heroX(), VIEW.ground - 13 * VIEW.s, 'dodge', '#9fe3ff'); return; }
  RT.hurt = true;
  dmg *= 1 - st.armor / 100;
  if (src && src.boss) dmg *= 1 - 0.01 * baseLv('thickskin');   // 🐢 Thick Skin
  if (src && src.range) dmg *= 1 - 0.03 * baseLv('deflect');    // 🪞 Deflect
  if (RT.warcryT > 0) dmg *= 1 - SKILLS.warcry.reduce;
  dmg *= buffMult('def');  // 🪨 Iron skin cookie
  h.hp -= dmg; h.flash = 0.15;
  floater(heroX(), VIEW.ground - 13 * VIEW.s, fmt(dmg), '#ff6b6b');
  if (h.hp <= 0) {
    // 🔥 Phoenix Feather: once per floor, rise again
    if (G.perks.phoenix && !RT.phoenixUsed) {
      RT.phoenixUsed = true; h.hp = st.hp * 0.25 * G.perks.phoenix; bump('phoenix');
      floater(heroX(), VIEW.ground - 18 * VIEW.s, '🔥 REBORN', '#ff9800', true); fx('ring', heroX(), VIEW.ground - 6 * VIEW.s, '#ff9800');
      return;
    }
    h.hp = 0; h.dead = true;
  }
}
function dealDamage(e, amt, crit, leech, quiet) {
  if (e.dead) return;
  const st = heroStats();
  if (e.boss) amt *= (1 + 0.3 * G.perks.slayer) * perkCompound('slayer') * st.bossMult;
  amt *= e.bmult || 1;                   // 📖 bestiary bonus against this monster
  if (RT.curseT > 0) amt *= BOSS_ABILITIES.curse.dmg;  // 🕯 cursed by a boss
  if (RT.warcryT > 0 && evolved('warcry')) amt *= 1.25;  // ✦ Rallying Cry
  if (hasTrait(e, 'armored') && !crit) amt *= 0.6;  // 🪨 Armored: crits pierce it
  if (e.immuneT > 0) { if (!quiet) floater(e.x, VIEW.ground - 13 * VIEW.s * e.scale, 'immune', '#90caf9'); return; }  // ☠ Barrier
  const dealt = amt;
  if (e.shield > 0) { const absorbed = Math.min(e.shield, amt); e.shield -= absorbed; amt -= absorbed; }  // shield soaks damage first
  const real = Math.max(0, Math.min(amt, e.hp));  // damage that actually landed (no overkill)
  e.hp -= amt; e.flash = 0.12;
  if (!quiet) floater(e.x, VIEW.ground - (e.fly ? 20 : 13) * VIEW.s * e.scale, (crit ? '✦' : '') + fmt(dealt), crit ? '#ffcf40' : '#ffffff', crit);
  // lifesteal heals from real damage only, and no faster than LEECH_RATE × lifesteal% of max health per second
  // (monsters have far more health than the hero, so uncapped lifesteal refilled you on every kill)
  if (leech) { const give = Math.min(real * leech / 100, RT.leechBank || 0); if (give > 0) { RT.leechBank -= give; heal(give); } }
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = 0.001; e.hp = 0;
  // ☠ Boss Rush: a boss only drops its items (at the floor it was fought at); nothing else pays out
  if (RT.rush) {
    if (e.boss) {
      const R = RT.rush; R.kills++;
      if (R.f > (G.stats.rushFloor || 0)) { if (featureOn('stars')) gainDust(STAR.rush * Math.max(1, zoneTier(R.f)), e.x); gainInsight(2); }  // ✧🧪 a new record
      G.stats.rushFloor = Math.max(G.stats.rushFloor || 0, R.f);  // record: the toughest Boss Rush boss beaten
      for (let i = itemsPerDrop(true); i > 0; i--) { const it = makeItem(R.f, true); R.items++; if (!R.best || itemOdds(it) < itemOdds(R.best)) R.best = it; gainItem(it); }
      toast(`☠ ${e.name} defeated! <span class="dim">(${R.kills}/${RUSH_LIST.length})</span>`, '#ffcf40', 'boss'); sfx('boss');
    }
    ui.dirty = true; return;
  }
  const st = heroStats();
  const echo = replaying() ? REPLAY_BONUS : 1;
  const gold = e.gold * st.goldMult * echo, xp = e.xp * st.xpMult * echo * (RT.special === 'library' ? 5 : 1);  // (📚 Lost Library)
  G.gold += gold; G.stats.gold += gold; G.stats.kills++;
  RT.acc.gold += gold; RT.acc.xp += xp; RT.acc.kills++;
  floater(e.x, VIEW.ground - 6 * VIEW.s, '+' + fmt(gold) + 'g', '#ffd54f');
  gainXp(xp);
  const rl = replaying() ? REPLAY_LOOT.fight : 1, chance = (e.boss ? 1 : dropChance(G.floor, e.loot || 1)) * rl;  // (less on replayed floors)
  if (Math.random() < chance) {
    for (let i = itemsPerDrop(e.boss) * (e.boss ? eventFx('bossLoot') : 1); i > 0; i--) gainItem(makeItem(G.floor, e.boss));  // (🌑 Eclipse: ×2)
    if (e.boss) maybeAmulet();
  }
  // splitters burst into two smaller copies
  if (hasTrait(e, 'splitter') && e.key) for (const dx of [-6, 6]) { const c = spawnEnemy(e.key, { minion: true, hpMult: 0.35, reward: 0.3, scale: 0.75, x: e.x + dx * VIEW.s / 3 }); c.name = 'Split ' + c.name; }
  // ☣ Toxic: a poison cloud (see tickBattle)
  if (hasTrait(e, 'toxic')) { RT.poisonT = 3; floater(e.x, VIEW.ground - 14 * VIEW.s, '☣', '#9ccc65', true); }
  if (e.trait && !e.minion) { bump('traitKills', e.trait); if (e.trait2) bump('traitKills', e.trait2); }
  if (e.champion && !e.minion) bump('champKills');
  // 🏟 the Arena Champion drops boss-quality items
  if (e.arena) for (let i = 0; i < 3; i++) gainItem(makeItem(G.floor, true));
  if (e.longRange) bump('rangedKills');
  countKill(e.beast);
  // ✨ special stage rewards
  if (RT.special === 'vault' && e.key === 'treasure_goblin') { const g = incomeGold(0.4); G.gold += g; G.stats.gold += g; floater(e.x, VIEW.ground - 14 * VIEW.s, '+' + fmt(g) + 'g', '#ffd54f', true); }
  if (RT.special === 'hall' && !e.boss && !e.minion) gainItem(makeItem(G.floor, true));
  if (RT.special === 'well') { const n = Math.max(1, Math.round(soulsFor(Math.max(G.maxFloor, REBIRTH_MIN_FLOOR)) * 0.004)); G.souls += n; floater(e.x, VIEW.ground - 18 * VIEW.s, `+${fmt(n)}✦`, '#b388ff', true); }
  if (RT.special === 'grotto' && e.key === 'crystal_bat' && Math.random() < 0.25) { gainGems(1, true); floater(e.x, VIEW.ground - 18 * VIEW.s, '💎', '#6fe3ff', true); }
  if (RT.special === 'mimic' && e.key === 'mimic') {  // 📦 each mimic pays like a treasure chest (and sometimes holds an item)
    const g = incomeGold(CHEST.minutes) * (1 + CHEST.magnetGold * (G.perks.magnet || 0)); G.gold += g; G.stats.gold += g;
    floater(e.x, VIEW.ground - 14 * VIEW.s, '+' + fmt(g) + 'g', '#ffd54f', true);
    if (Math.random() < 0.25) gainItem(makeItem(G.floor, true));
  }
  if (RT.special === 'scrapheap' && !e.minion) { const n = Math.round(rand(1, 3) * (1 + zoneTier(G.floor))); G.scrap = (G.scrap || 0) + n; G.stats.scrap = (G.stats.scrap || 0) + n; floater(e.x, VIEW.ground - 18 * VIEW.s, `+${n}🔩`, '#b0bec5', true); }
  if (baseLv('regrowth')) heal(st.hp * 0.002 * baseLv('regrowth'));  // 🌱 Regrowth (was 0.5% per level)
  if (e.boss && Math.random() < PET_DROP) unlockRandomPet(`${e.name} dropped a pet`);
  if (e.boss) {
    const zi = ZONES.indexOf(zoneOf(G.floor));
    G.stats.bossKills++; bump('bossZ', zi); bump(e.bossKind === 'guard' ? 'bossG' : 'bossL', zi);
    if (RT.twin && !aliveEnemies().some(o => o.boss)) bump('twinKills');
    if (RT.t - (e.born || 0) <= 3) G.stats.fastBoss = 1;
    if ((e.abs || []).length >= 3) bump('tripleBoss');
    toast(`☠ ${e.name} defeated!`, '#ffcf40', 'boss'); sfx('boss'); addLog(`Defeated ${e.name} on floor ${G.floor}`);
  }
  ui.dirty = true;
}
function gainXp(xp) {
  const h = G.hero; h.xp += xp;
  let up = false;
  const lv0 = h.lvl;
  while (h.xp >= xpNeed(h.lvl)) { h.xp -= xpNeed(h.lvl); h.lvl++; up = true; }
  if (up) {
    const before = heroStats().hp; statCache = null;
    if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
    floater(heroX(), VIEW.ground - 16 * VIEW.s, 'LEVEL UP', '#7df9ff');
    G.stats.maxLvl = Math.max(G.stats.maxLvl || 1, h.lvl);
    // newly learned skills: a toast the first time ever, a quick floater when relearning after a rebirth
    for (const [k, S] of Object.entries(SKILLS)) {
      if (S.lvl <= lv0 || S.lvl > h.lvl) continue;
      if (!G.seen['skill_' + k]) { G.seen['skill_' + k] = 1; toast(`${S.icon} New skill learned: <b style="color:${S.color}">${S.name}</b>`, S.color, 'skill'); addLog(`Learned ${S.name} at level ${S.lvl}`); }
      else floater(heroX(), VIEW.ground - 20 * VIEW.s, `${S.icon} ${S.name}`, S.color, true);
    }
    ui.dirty = true;
  }
}
function floater(x, y, text, color, big) {
  if (headless || simFast || !RT) return;
  RT.floaters.push({ x: x + rand(-6, 6), y, text, color, big, t: 0 });
  if (RT.floaters.length > 40) RT.floaters.shift();
}
function fx(kind, x, y, color) { if (!headless && !simFast) RT.fx.push({ kind, x, y, t: 0, color }); }
const inReach = e => e.x - heroX() <= 12 * VIEW.s + 16 + 6 * VIEW.s * (e.scale - 1);

// bonus: extra damage per hit (Battle Fury)
function heroAttack(st, bonus = 1) {
  const line = aliveEnemies().filter(inReach).sort((a, b) => a.x - b.x);
  if (!line.length) return false;
  const strike = () => {
    const t = aliveEnemies().filter(inReach).sort((a, b) => a.x - b.x)[0]; if (!t) return;
    if (st.miss && Math.random() * 100 < st.miss) { floater(t.x, VIEW.ground - 13 * VIEW.s, 'miss', '#bdbdbd'); return; }  // 🌍 Mirage
    if (hasTrait(t, 'ghostly') && Math.random() < 0.25) { floater(t.x, VIEW.ground - 13 * VIEW.s, 'phased', '#b3e5fc'); return; }  // 👻 Ghostly
    const crit = Math.random() * 100 < st.crit, dmg = st.atk * bonus * (crit ? 1 + st.critD / 100 : 1) * rand(0.9, 1.1);
    if (crit) bump('crits');
    dealDamage(t, dmg, crit, st.leech);
    // splash: part of the hit carries over to the next monster in line
    if (st.splash) { const next = aliveEnemies().filter(o => o !== t).sort((a, b) => a.x - b.x)[0]; if (next) dealDamage(next, dmg * st.splash / 100, false, 0, true); }
  };
  strike();
  if (st.multi && Math.random() * 100 < st.multi) strike();  // multistrike: a second hit
  RT.hero.anim = 0.15;
  return true;
}
// ---- skills: each fires on its own cooldown; returns false if it had nothing to do (it then stays ready) ----
const skillReach = () => aliveEnemies().filter(e => e.x - heroX() <= 12 * VIEW.s + 40 + 6 * VIEW.s * (e.scale - 1));
const frontEnemy = () => aliveEnemies().filter(inReach).sort((a, b) => a.x - b.x)[0];
function skillShout(k, x = heroX()) {
  const S = SKILLS[k];
  floater(x, VIEW.ground - 18 * VIEW.s, `${S.icon} ${evolved(k) ? SKILL_EVO[k].name : S.name}!`, S.color, true);
}
const SKILL_FX = {
  cleave(st) {
    const hit = skillReach(); if (!hit.length) return false;
    hit.forEach(e => dealDamage(e, st.atk * SKILLS.cleave.dmg, false, st.leech));
    if (evolved('cleave')) hit.forEach(e => { if (!e.dead) e.bleed = { dps: st.atk * 1 / 3, t: 3, tick: 0 }; });  // ✦ Rending Cleave
    fx('ring', heroX() + 10 * VIEW.s, VIEW.ground - 6 * VIEW.s, SKILLS.cleave.color); skillShout('cleave');
    return true;
  },
  execute(st) {  // (✦ Guillotine: kills under 45% instead of 30%)
    const S = SKILLS.execute, e = frontEnemy(); if (!e) return false;
    if (!e.boss && e.hp / e.maxHp < (evolved('execute') ? 0.45 : S.below)) { e.shield = 0; bump('executes'); dealDamage(e, e.hp + 1, false, 0, true); floater(e.x, VIEW.ground - 17 * VIEW.s * e.scale, 'EXECUTED', S.color, true); }
    else dealDamage(e, st.atk * S.dmg * (e.boss ? 2 : 1), true, st.leech);
    fx('ring', e.x, VIEW.ground - 6 * VIEW.s, S.color); skillShout('execute');
    return true;
  },
  bash(st) {
    const S = SKILLS.bash, e = frontEnemy(); if (!e) return false;
    dealDamage(e, st.atk * S.dmg, false, st.leech);
    for (const o of skillReach()) if (!o.boss) o.stunT = S.stun * skillPower('bash');  // bosses shrug off the stun
      else if (evolved('bash')) o.stunT = S.stun * skillPower('bash') / 2;  // … unless it's evolved (✦ Earthshaker)
    fx('ring', e.x, VIEW.ground - 6 * VIEW.s, S.color); skillShout('bash');
    return true;
  },
  whirlwind() {
    if (!skillReach().length) return false;
    RT.whirl = { n: evolved('whirlwind') ? 10 : SKILLS.whirlwind.hits, t: 0 }; skillShout('whirlwind');  // (✦ Cyclone: 10 hits)
    return true;
  },
  warcry() {
    if (!aliveEnemies().length) return false;
    RT.warcryT = SKILLS.warcry.secs * skillPower('warcry'); skillShout('warcry');
    fx('ring', heroX(), VIEW.ground - 8 * VIEW.s, SKILLS.warcry.color);
    return true;
  },
  thunder(st) {
    const S = SKILLS.thunder, e = onScreen().sort((a, b) => b.hp - a.hp)[0]; if (!e) return false;
    dealDamage(e, st.atk * S.dmg, true, st.leech);
    // ✦ Chain Lightning: jumps to 3 more enemies for half damage
    if (evolved('thunder')) onScreen().filter(o => o !== e).sort((a, b) => b.hp - a.hp).slice(0, 3).forEach(o => dealDamage(o, st.atk * S.dmg / 2, false, 0));
    RT.bolt = { x: e.x, t: 0.25 }; skillShout('thunder', e.x);
    return true;
  },
  rend(st) {
    const S = SKILLS.rend, e = frontEnemy(); if (!e) return false;
    e.bleed = { dps: st.atk * S.dmg / S.secs, t: S.secs, tick: 0 };
    if (evolved('rend')) for (const o of skillReach()) if (o !== e) o.bleed = { dps: st.atk * S.dmg / S.secs, t: S.secs, tick: 0 };  // ✦ Hemorrhage
    fx('ring', e.x, VIEW.ground - 6 * VIEW.s, S.color); skillShout('rend');
    return true;
  },
  slam(st) {
    const S = SKILLS.slam, hit = onScreen(); if (!hit.length) return false;
    hit.forEach(e => dealDamage(e, st.atk * S.dmg, false, st.leech));
    if (evolved('slam')) RT.aftershock = { t: 1, dmg: st.atk * 1 };  // ✦ Aftershock (see tickSkills)
    fx('ring', heroX() + 20 * VIEW.s, VIEW.ground, S.color); fx('ring', heroX() + 45 * VIEW.s, VIEW.ground, S.color); skillShout('slam');
    return true;
  },
  fury() {
    if (!aliveEnemies().length) return false;
    RT.furyT = SKILLS.fury.secs * skillPower('fury'); skillShout('fury');
    return true;
  },
};
const onScreen = () => aliveEnemies().filter(e => e.x <= VIEW.w);
// Rend: bleeding monsters take damage every half second
function tickBleeds(dt) {
  for (const e of aliveEnemies()) {
    const b = e.bleed; if (!b) continue;
    b.t -= dt; b.tick += dt;
    if (b.tick >= 0.5 || b.t <= 0) { dealDamage(e, b.dps * b.tick, false, 0, true); b.tick = 0; }
    if (b.t <= 0) e.bleed = null;
  }
}
function tickSkills(dt, st) {
  for (const k in SKILLS) {
    if (!skillActive(k)) continue;
    RT.skillT[k] = (RT.skillT[k] || 0) + dt;
    // 💎 skill ranks: attacks hit harder (their damage is all based on attack)
    const sst = skillRank(k) ? Object.assign({}, st, { atk: st.atk * skillPower(k) }) : st;
    if (RT.skillT[k] >= skillCd(k)) { if (SKILL_FX[k](sst)) RT.skillT[k] = 0; else RT.skillT[k] = skillCd(k); }
  }
  // Whirlwind keeps spinning for a few hits after it starts
  const w = RT.whirl;
  if (w) {
    w.t -= dt;
    if (w.t <= 0) {
      w.t += SKILLS.whirlwind.every; w.n--;
      skillReach().forEach(e => dealDamage(e, st.atk * SKILLS.whirlwind.dmg * skillPower('whirlwind'), false, st.leech, true));
      fx('ring', heroX(), VIEW.ground - 6 * VIEW.s, SKILLS.whirlwind.color); RT.hero.anim = 0.1;
      if (w.n <= 0) RT.whirl = null;
    }
  }
  // ✦ Aftershock: Ground Slam's second shockwave
  const af = RT.aftershock;
  if (af) { af.t -= dt; if (af.t <= 0) { RT.aftershock = null; onScreen().forEach(e => dealDamage(e, af.dmg, false, 0, true)); fx('ring', heroX() + 30 * VIEW.s, VIEW.ground, SKILLS.slam.color); } }
  tickBleeds(dt);
}
function enemyAttack(e) {
  if (RT.hero.dead || ENEMIES[e.key] && ENEMIES[e.key].harmless) return;  // treasure goblins don't fight back
  let dmg = e.atk * rand(0.9, 1.1);
  if (hasTrait(e, 'berserker')) dmg *= 1 + 1.5 * (1 - e.hp / e.maxHp);
  if (hasTrait(e, 'vampiric')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06);  // 🦇 heals as it hits
  if (hasTrait(e, 'bomber')) {  // explodes on contact
    hurtHero(dmg * 4, null); fx('cleave', e.x, VIEW.ground - 6 * VIEW.s);
    floater(e.x, VIEW.ground - 16 * VIEW.s, '💥', '#ff9800', true);
    killEnemy(e); return;
  }
  if (e.charge) { e.charge = false; dmg *= 2; RT.hero.stun = 1; floater(heroX(), VIEW.ground - 18 * VIEW.s, 'STUNNED', '#ffe066', true); }
  if (e.range) {
    if (headless) { hurtHero(dmg, e); return; }
    RT.proj.push({ color: (e.pal && Object.values(e.pal)[0]) || SPRITES[e.sprite].pal[Object.keys(SPRITES[e.sprite].pal)[0]], x: e.x - 4 * VIEW.s, y: VIEW.ground - (e.fly ? 16 : 8) * VIEW.s, speed: 180, dmg, t: 0, src: e });
  } else { hurtHero(dmg, e); e.lunge = 0.15; }
}

function tickBattle(dt) {
  RT.t += dt;
  const s = VIEW.s, st = heroStats(), h = RT.hero;
  // (while the window is minimized/hidden the hero only farms: no retry pushes)
  if (G.farm && !ui.away) { G.farmT += dt; if (G.farmT >= retryTime()) { G.farm = false; G.farmT = 0; addLog('Pushing deeper again'); ui.dirty = true; } }
  tickEvents(dt);  // 🌍
  // golden-cookie buffs run down
  if (G.buffs.length) {
    for (const bf of G.buffs) bf.t -= dt;
    if (G.buffs.some(bf => bf.t <= 0)) { G.buffs = G.buffs.filter(bf => bf.t > 0); statCache = null; }
  }
  // progress watchdog for auto-rebirth
  if (G.maxFloor > (RT.lastMax || 0)) { RT.lastMax = G.maxFloor; G.stuckT = 0; } else if (!ui.away) G.stuckT += dt;  // farming while away doesn't count as stuck
  // 💪 Grit changes your stats when it goes up (or resets on a new floor)
  if (G.challenge && gritLvl() !== (RT.grit || 0)) {
    const before = heroStats().hp; RT.grit = gritLvl(); dirtyStats();
    if (!RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
    if (RT.grit) floater(heroX(), VIEW.ground - 20 * VIEW.s, `💪 Grit +${Math.round(GRIT.per * RT.grit * 100)}%`, '#ffb74d', true);
  }
  if (!headless) {
    // treasure chest: walks in, collects itself after a few seconds (Chest Magnet: more often)
    if (featureOn('chests')) G.chestT -= dt * eventFx('chest');  // (📦 Treasure Rain)
    if (G.chestT <= 0 && !RT.chest) { RT.chest = { x: VIEW.w + 20, age: 0 }; G.chestT = rand(90, 200) / (1 + CHEST.magnetFreq * (G.perks.magnet || 0)) / (hasRelic('map') ? CHEST.mapFreq : 1) / (1 + CHEST.hunterFreq * baseLv('chesthunter')); }
    if (RT.chest) { RT.chest.age += dt; RT.chest.x = Math.max(VIEW.w * 0.55, RT.chest.x - 60 * s / 3 * dt); if (RT.chest.age >= 4) openChest(); }
    // golden cookie: pops up somewhere for 20s (Sweet Tooth: more often)
    if (featureOn('cookies')) G.cookieT -= dt * eventFx('cookie');  // (🍪 Cookie Festival)
    if (G.cookieT <= 0 && !RT.cookie) { RT.cookie = { fx: rand(0.35, 0.85), fy: rand(0.2, 0.55), t: 20 }; G.cookieT = rand(180, 420) / (1 + 0.15 * (G.perks.sweet || 0)); }
    if (RT.cookie) {
      RT.cookie.t -= dt;
      if (hasRelic('cookieJar') && RT.cookie.t <= 18) eatCookie();  // 🍪 Cookie Jar: eats itself after 2s
      else if (RT.cookie.t <= 0) RT.cookie = null;
    }
  }
  // phases
  if (RT.phase === 'walk') {
    RT.scroll += (RT.blitz ? 400 : 80) * s / 3 * dt; RT.walkT -= dt;
    if (!h.dead) h.hp = Math.min(st.hp, h.hp + st.hp * WALK_HEAL * chalFx('heal') * dt);  // catching your breath between floors
    if (RT.walkT <= 0) {
      if (RT.rush) startRushFight();
      else if (canBlitz()) { blitzFloor(); RT.blitz = true; RT.walkT = REPLAY.blitzStep; ui.dirty = true; }
      else { RT.blitz = false; startFloor(); }
    }
  } else if (RT.phase === 'fight') {
    RT.spawnT -= dt;
    RT.fightT += dt;
    if (RT.queue.length && RT.spawnT <= 0) { spawnEnemy(RT.queue.shift()); RT.spawnT = replaying() ? REPLAY.spawn : 0.3; }
    if (RT.isBoss) { RT.bossT -= dt; if (RT.bossT <= 0) return fail(`Out of time! ${bossLabel(G.floor)} ${RT.twin ? 'are' : 'is'} too strong`); }
    // 💰 Treasure Vault: goblins still around when time's up escape (the floor still counts)
    if (RT.special === 'vault' && RT.specialT > 0) {
      RT.specialT -= dt;
      if (RT.specialT <= 0) {
        const left = aliveEnemies().length + RT.queue.length;
        RT.enemies = RT.enemies.filter(e => e.dead); RT.queue = [];
        if (left) floater(VIEW.w * 0.7, VIEW.ground - 18 * VIEW.s, `${left} escaped!`, '#ffd54f', true);
      }
    }
  }
  // hero
  h.anim = Math.max(0, h.anim - dt); h.flash = Math.max(0, h.flash - dt);
  if (h.dead) return fail('Your hero fell');
  h.hp = Math.min(st.hp, h.hp + st.hp * (0.012 + st.regen / 100) * st.heal * dt);
  // lifesteal budget refills over time (see dealDamage)
  RT.leechBank = Math.min(st.hp * st.leech / 100 * LEECH_RATE, (RT.leechBank || 0) + st.hp * st.leech / 100 * LEECH_RATE * dt);
  // 🌍 zones that hurt over time (heat, poison) while fighting
  if (st.dot && RT.phase === 'fight' && aliveEnemies().length) { h.hp -= st.hp * st.dot / 100 * dt; if (h.hp <= 0) { h.hp = 0; h.dead = true; } }
  // ☣ a Toxic monster's poison cloud
  if (RT.poisonT > 0) { RT.poisonT -= dt; if (RT.phase === 'fight') { h.hp -= st.hp * 0.02 * dt; if (h.hp <= 0) { h.hp = 0; h.dead = true; } } }
  h.stun = Math.max(0, (h.stun || 0) - dt);
  if (RT.phase === 'fight' && !h.stun) {
    h.atkT += dt * st.spd;
    if (h.atkT >= 1) { if (heroAttack(st, RT.furyT > 0 ? (evolved('fury') ? 2 : SKILLS.fury.mult) : 1)) h.atkT -= 1; else h.atkT = 1; }  // (✦ Bloodlust: +100%)
    tickSkills(dt, st);
  }
  // 👻 Spirit Companion: strikes the front enemy once a second
  if (RT.phase === 'fight' && G.perks.companion) {
    RT.compT = (RT.compT || 0) + dt;
    const e = RT.compT >= 1 && frontEnemy();
    if (e) { RT.compT = 0; RT.compHit = 0.2; dealDamage(e, st.atk * 0.08 * G.perks.companion, false, 0); }
  }
  RT.compHit = Math.max(0, (RT.compHit || 0) - dt);
  RT.warcryT = Math.max(0, RT.warcryT - dt); RT.furyT = Math.max(0, (RT.furyT || 0) - dt); RT.curseT = Math.max(0, (RT.curseT || 0) - dt);
  // 🌍 Thunderstorm: lightning helps out every few seconds
  const zb = zoneFx(G.floor).bolt;
  if (zb && RT.phase === 'fight') {
    RT.zboltT = (RT.zboltT || 0) + dt;
    const tgt = RT.zboltT >= zb && onScreen().sort((a, b) => b.hp - a.hp)[0];
    if (tgt) { RT.zboltT = 0; dealDamage(tgt, st.atk * 2, false, 0); RT.bolt = { x: tgt.x, t: 0.25 }; }
  }
  if (RT.bolt) { RT.bolt.t -= dt; if (RT.bolt.t <= 0) RT.bolt = null; }
  // enemies queue up in front of the hero; the first 3 can hit him in melee,
  // ranged ones shoot from wherever they are in the line and move up as it clears
  let stopX = heroX() + 12 * s + 2;
  aliveEnemies().sort((a, b) => a.x - b.x).forEach((e, i) => {
    const w = 12 * s * e.scale;
    moveEnemy(e, stopX + w / 2 - 6 * s, dt, e.range || i < 3);
    stopX += w * 0.75;
  });
  for (const e of RT.enemies.slice()) { traitTick(e, dt); bossTick(e, dt); }
  for (const e of RT.enemies) { e.flash = Math.max(0, e.flash - dt); e.lunge = Math.max(0, (e.lunge || 0) - dt); if (e.dead) e.dead += dt; }
  RT.enemies = RT.enemies.filter(e => !e.dead || e.dead < 0.45);
  // enemy projectiles fly at the hero
  for (const p of RT.proj) {
    p.t += dt;
    const tx = heroX(), ty = VIEW.ground - 7 * s, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = p.speed * s / 3 * dt;
    if (d <= step + 2 || p.t > 3) { p.done = true; hurtHero(p.dmg, p.src); }
    else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  RT.proj = RT.proj.filter(p => !p.done);
  if (RT.phase === 'fight' && !RT.queue.length && !aliveEnemies().length) clearFloor();
  for (const f of RT.floaters) f.t += dt;
  RT.floaters = RT.floaters.filter(f => f.t < 1);
  for (const f of RT.fx) f.t += dt;
  RT.fx = RT.fx.filter(f => f.t < 0.5);
  // income rate tracking (used for offline progress)
  RT.acc.t += dt;
  if (RT.acc.t >= 10) {
    const k = 0.25;
    G.rates.gold = G.rates.gold * (1 - k) + RT.acc.gold / RT.acc.t * k;
    G.rates.xp = G.rates.xp * (1 - k) + RT.acc.xp / RT.acc.t * k;
    G.rates.kills = G.rates.kills * (1 - k) + RT.acc.kills / RT.acc.t * k;
    RT.acc = { gold: 0, xp: 0, kills: 0, t: 0 };
  }
}
function moveEnemy(e, stop, dt, canHit) {
  const s = VIEW.s;
  // 🏹 throwers/archers shoot while they're still walking in (once they're on screen)
  if (e.longRange && e.x > stop + 0.5 && e.x <= VIEW.w * 0.95 && RT.phase === 'fight' && !(e.stunT > 0)) {
    e.atkT += dt * e.spd; if (e.atkT >= 1) { e.atkT -= 1; enemyAttack(e); }
  }
  if (e.x > stop + 0.5) { const boost = (e.x > VIEW.w * 0.7 ? 3 : 1.6) * (replaying() ? REPLAY.move : 1); e.x = Math.max(stop, e.x - e.move * boost * s / 3 * dt); return; }
  // ended up behind its spot (e.g. right after the window was resized): step forward to it
  if (e.x < stop - 0.5) { e.x = Math.min(stop, e.x + 120 * s / 3 * dt); return; }
  if (RT.phase !== 'fight' || !canHit) return;
  if (e.stunT > 0) { e.stunT -= dt; return; }  // Shield Bash
  e.atkT += dt * e.spd * (hasTrait(e, 'berserker') ? 1 + (1 - e.hp / e.maxHp) : 1);
  if (e.atkT >= 1) { e.atkT -= 1; enemyAttack(e); }
}
function clearFloor() {
  if (RT.rush) return rushNext();
  if (RT.isBoss) toast(`Floor ${G.floor} cleared!`, '#7df9ff', 'boss');
  if (RT.isBoss && !RT.hurt) G.stats.flawless = (G.stats.flawless || 0) + 1;
  if (RT.special === 'den' && Math.random() < 0.35) unlockRandomPet('The Beast Den held a pet');  // 🐾
  if (RT.special === 'shrine') {  // ⛩ a blessing and a golden cookie
    G.buffs = G.buffs.filter(b => b.id !== 'shrine'); G.buffs.push({ id: 'shrine', icon: '⛩', label: 'Blessing', mult: { atk: 1.5 }, t: 120, max: 120 }); statCache = null;
    if (!RT.cookie && !headless) RT.cookie = { fx: rand(0.35, 0.85), fy: rand(0.2, 0.55), t: 20 };
    toast('⛩ The shrine blesses you: ×1.5 damage for 2 minutes', '#ffe082');
  }
  RT.special = null;
  // 💎 first time ever clearing this boss floor
  if (RT.isBoss && G.floor > (G.gemFloor || 0)) { gainGems(gemsForBoss(G.floor), true); G.gemFloor = G.floor; }  // (0 for non-zone bosses)
  if (RT.hero.hp > 0 && RT.hero.hp < heroStats().hp * 0.05) G.stats.closeCall = 1;
  const wasReplay = replaying(), z0 = zoneIndex(G.floor);
  if (!wasReplay && !G.farm) bump('newFloors');
  // ✧ Stardust: the first time ever this floor is beaten (starFloor = deepest floor that has paid)
  // 🧪 Insight: first-ever boss floor clears. ☄ Meteor Shower: replays drop a little Stardust too
  if (G.floor > (G.starFloor || 0)) {
    G.starFloor = G.floor; const d = starFor(G.floor); if (d) gainDust(d, heroX());
    if (isBossFloor(G.floor)) gainInsight(1 + zoneTier(G.floor), heroX());
  } else if (eventDef() && eventDef().fx.dustAll && featureOn('stars')) gainDust(Math.max(1, zoneTier(G.floor)), heroX());
  // ⚜ Oath mastery: every floor fought and beaten under it (not while farming)
  if (G.oath && !G.farm) { G.oathXp[G.oath] = (G.oathXp[G.oath] || 0) + labMult('oathXp'); if (oathLvl(G.oath) !== RT.oathLv) { if (RT.oathLv != null) { dirtyStats(); toast(`⚜ ${OATHS[G.oath].name} mastery ${oathLvl(G.oath)}`, OATHS[G.oath].color); } RT.oathLv = oathLvl(G.oath); } }
  // 🔒 farming a boss floor was too good (gold and boss-quality items): a boss floor can be cleared BOSS_FARM_MAX times a
  // run, then farming it moves you on to the next floor (still farming). A fall from there skips back past it (see fail)
  if (RT.isBoss) {
    const bc = G.bossClears || (G.bossClears = {}); bc[G.floor] = (bc[G.floor] || 0) + 1;
    if (G.farm && bc[G.floor] >= BOSS_FARM_MAX) {
      G.floor++; if (G.floor > G.maxFloor) G.maxFloor = G.floor; if (G.floor > G.bestFloor) G.bestFloor = G.floor; G.farmT = 0;
      toast(`🔒 ${bossLabel(G.floor - 1)} beaten ${BOSS_FARM_MAX} times: on to floor ${G.floor}`, '#ffb74d', 'boss'); addLog(`🔒 Boss floor ${G.floor - 1} farmed ${BOSS_FARM_MAX} times: moved on to floor ${G.floor}`);
    }
  }
  if (!G.farm) { G.floor += 1 + replaySkip(); if (G.floor > G.maxFloor) G.maxFloor = G.floor; if (G.floor > G.bestFloor) G.bestFloor = G.floor; }
  // 🔁 starting a lap for the first time
  const lapNow = zoneTier(G.floor);
  if (lapNow > (G.stats.maxLap || 0)) {
    G.stats.maxLap = lapNow;
    const m = `🔁 Lap ${roman(lapNow + 1)} begins! Monsters are ×${fmt(Math.pow(LAP.hp, lapNow))} tougher (×${fmt(Math.pow(LAP.atk, lapNow))} damage), rewards ×${fmt(Math.pow(2, lapNow))}`;
    addLog(m); sfx('boss');
    // 🌅 beating the Unmaker for the first time on a lap: the hero "wakes up" back at the start. The wake-up plays only
    // the first time in a save; later new laps go straight to the popup with the monsters' new numbers
    if (headless || ui.away) toast(m, '#7df9ff', 'zone');
    else if (!G.seen.wake) { G.seen.wake = 1; ui.wake = { t0: performance.now(), lap: lapNow }; }
    else showLapModal(lapNow);
  }
  // 🌍 entering a new zone: say what its rule is (not while racing through replays)
  if (zoneIndex(G.floor) !== z0 && !replaying()) { const zf = zoneFx(G.floor); toast(`🌍 ${zoneOf(G.floor).name}: <b>${zf.name}</b> <span class="dim">${zf.desc}</span>`, '#a5d6a7', 'zone'); }
  RT.phase = 'walk'; RT.walkT = wasReplay ? REPLAY.walk : 0.55; RT.proj = [];
  ui.dirty = true;
}
function fail(msg) {
  // ⏩ dying switches 3× speed back off (not a boss timer running out)
  if (RT.hero.dead && G.settings.speed3) { G.settings.speed3 = false; toast('⏩ Back to normal speed: your hero fell', '#7df9ff'); }
  if (RT.rush) return endRush(RT.hero.dead ? 'You fell' : 'Out of time');
  toast(msg, '#ff6b6b'); addLog(`${msg} (floor ${G.floor})`); bump('deaths');
  G.floor = Math.max(1, G.floor - (chalFx('fallBack') > 1 ? chalFx('fallBack') : 1)); G.farm = true; G.farmT = 0;  // (⏬ Backslide challenge)
  if (bossLocked(G.floor)) G.floor = Math.max(1, G.floor - 1);  // 🔒 a used-up boss floor: fall back past it
  RT.enemies = []; RT.proj = []; RT.queue = []; RT.phase = 'walk'; RT.walkT = 1.2;
  RT.hero.dead = false; RT.hero.hp = heroStats().hp;
  ui.dirty = true;
}

// 🔒 boss floors cleared BOSS_FARM_MAX times this run can't be farmed (counts reset on rebirth)
const BOSS_FARM_MAX = 3;
const bossLocked = f => isBossFloor(f) && ((G.bossClears || {})[f] || 0) >= BOSS_FARM_MAX;
// ---------------- ☠ Boss Rush ----------------
// every zone's Guardian then Lord, in zone order; each one is fought as if it were deeper than the last
const RUSH_LIST = ZONES.flatMap((z, zi) => [{ zi, kind: 'guard' }, { zi, kind: 'lord' }]);
const rushWait = () => Math.max(0, (G.rush.last || 0) + RUSH.cooldown * 1000 - Date.now()) / 1000;  // seconds until the next one
// the first boss is as strong as the toughest boss you've ever beaten in a Boss Rush (stats.rushFloor), so each rush
// picks up at your record; with no record yet, this run's deepest floor. (Was half your all-time best floor, which got
// easy once rebirths made you stronger.) Each next boss is RUSH.step of that deeper. A running rush keeps the numbers
// it started with.
const rushStart = () => RT && RT.rush ? RT.rush.start : Math.max(10, G.stats.rushFloor || G.maxFloor);
const rushStep = () => RT && RT.rush ? RT.rush.step : Math.max(2, Math.round(rushStart() * RUSH.step));
const rushFloor = k => rushStart() + k * rushStep();
function startRush() {
  if (!featureOn('rush') || RT.rush || rushWait() > 0) return;
  G.rush.last = Date.now(); bump('rushes');
  const start = rushStart(), step = rushStep();
  RT.rush = { k: 0, kills: 0, items: 0, best: null, start, step };
  RT.enemies = []; RT.queue = []; RT.proj = []; RT.special = null; RT.whirl = null; RT.bleed = null;
  RT.hero.dead = false; RT.hero.hp = heroStats().hp; RT.isBoss = true;
  setRushBoss(); RT.phase = 'walk'; RT.walkT = RUSH.walk;
  toast(`☠ <b>Boss Rush!</b> <span class="dim">${RUSH_LIST.length} bosses, from floor ${rushFloor(0)} up</span>`, '#ff5252'); addLog(`☠ Boss Rush started (floor ${rushFloor(0)} up)`); sfx('boss');
  ui.dirty = true;
}
function setRushBoss() { const R = RT.rush, B = RUSH_LIST[R.k]; R.zi = B.zi; R.kind = B.kind; R.f = rushFloor(R.k); }
function startRushFight() {
  RT.queue = ['BOSS:' + RT.rush.kind]; RT.isBoss = true; RT.twin = false; RT.bossT = bossTime();
  RT.phase = 'fight'; RT.spawnT = 0; RT.fightT = 0; RT.phoenixUsed = false; RT.hurt = false;
}
function rushNext() {
  const R = RT.rush; R.k++; RT.proj = [];
  if (R.k >= RUSH_LIST.length) return endRush(null);
  setRushBoss(); RT.phase = 'walk'; RT.walkT = RUSH.walk; ui.dirty = true;
}
// why = what ended it (null: every boss beaten)
function endRush(why) {
  const R = RT.rush; if (!R) return;
  RT.rush = null;
  G.stats.rushBest = Math.max(G.stats.rushBest || 0, R.kills);
  RT.enemies = []; RT.proj = []; RT.queue = []; RT.isBoss = false; RT.phase = 'walk'; RT.walkT = 1.2;
  RT.hero.dead = false; RT.hero.hp = heroStats().hp;
  const head = why ? `${why} against boss ${R.k + 1}` : `Every boss defeated!`;
  addLog(`☠ Boss Rush over: ${R.kills}/${RUSH_LIST.length} bosses, ${R.items} items`);
  if (!headless) showModal(`<b>☠ Boss Rush ${why ? 'over' : 'complete!'}</b>
    <div>${head}: <b>${R.kills} / ${RUSH_LIST.length}</b> bosses defeated${R.kills >= (G.stats.rushBest || 0) && R.kills ? ' <span class="up">(best!)</span>' : ''}</div>
    <div>🎒 ${R.items} item${R.items === 1 ? '' : 's'} found${R.best ? ` · best: ${nameHtml(R.best)}` : ''}</div>
    <div class="dim small">Next Boss Rush in ${fmtTime(rushWait())}.</div>
    <button data-act="closeModal">Continue</button>`);
  ui.dirty = true;
}

// ---------------- 🏁 challenge runs ----------------
// your save is parked in MAIN and a fresh game (with the challenge's rule) runs in G until you win or back out
function startChallenge(id) {
  const C = CHALLENGES[id]; if (!C || G.challenge || RT.rush || !featureOn('challenges') || G.chal.done[id]) return;
  save();
  MAIN = G;
  const c = newGame();
  c.challenge = { id, at: Date.now() };
  c.settings = JSON.parse(JSON.stringify(MAIN.settings)); Object.assign(c.settings, { autoRebirth: false, autoUpg: false, autoForge: false });
  c.seen = JSON.parse(JSON.stringify(MAIN.seen));  // (no "new upgrade" popups for things you already know)
  c.cos = Object.assign({}, MAIN.cos, { pet: 'none' });  // same look, but pets' bonuses stay home
  G = c; statCache = null; heroIconUrl = null; initRun(); ui.confirm = null;
  toast(`🏁 <b>${C.name}</b>: ${C.rule}. Reach floor ${C.goal}${C.fx.time ? ` within ${fmtTime(C.fx.time)}` : ''}!`, '#ffd54f');
  addLog(`🏁 Started the ${C.name} challenge`);
  save(); ui.dirty = true;
}
function leaveChallenge(won) {
  if (!MAIN || !G.challenge) return;
  const c = G, id = c.challenge.id, C = CHALLENGES[id];
  // window / popup settings changed during the run come along; automation choices stay as they were
  const s = c.settings;
  for (const k of ['autoRebirth', 'autoPerks', 'autoUpg', 'autoForge', 'autoSkip']) s[k] = MAIN.settings[k];
  G = MAIN; MAIN = null; G.settings = s;
  G.stats.time += c.stats.time || 0;  // (playtime in the challenge counts toward your save's)
  G.chal.best[id] = Math.max(G.chal.best[id] || 0, c.bestFloor);
  if (won && !G.chal.done[id]) {
    G.chal.done[id] = Date.now();
    const rw = chalRewardText(C);
    addLog(`🏁 Beat the ${C.name} challenge: ${rw}`); sfx('ach');
    if (!headless) showModal(`<b class="lapt">🏁 ${C.name} beaten!</b><div>You reached floor ${C.goal}${C.fx.time ? ` in ${fmtTime(c.stats.time)}` : ''} with <i>${C.rule.toLowerCase()}</i>.</div>
      <div>Permanent reward on your save: <b class="up">${rw}</b></div><button data-act="closeModal">Back to your save</button>`);
  } else addLog(`🏁 Left the ${C.name} challenge (best floor ${c.bestFloor})`);
  statCache = null; heroIconUrl = null; initRun(); ui.confirm = null; save(); ui.dirty = true;
}
const chalRewardText = C => Object.entries(C.reward).map(([k, v]) => `×${v} ${CHALLENGE_REWARD_NAMES[k]}`).join(', ');
function checkChallenge() {
  const C = chalDef(); if (!C) return;
  if (G.bestFloor >= C.goal) leaveChallenge(true);
  else if (C.fx.time && G.stats.time > C.fx.time) {
    toast(`🏁 Time's up! ${C.name} ended on floor ${G.bestFloor} of ${C.goal}`, '#ff6b6b');
    leaveChallenge(false);
  }
}
const cookiePos = () => ({ x: RT.cookie.fx * VIEW.w, y: RT.cookie.fy * VIEW.ground, r: 5 * VIEW.s + 4 });
function clickAt(mx, my) {
  const s = VIEW.s;
  if (RT.cookie) { const c = cookiePos(); if (Math.hypot(mx - c.x, my - c.y) < c.r + 6) { eatCookie(); return; } }
  if (RT.chest && Math.abs(mx - RT.chest.x) < 8 * s && my > VIEW.ground - 12 * s) openChest();
}
function openChest() {
  const c = RT.chest; RT.chest = null; G.stats.chests = (G.stats.chests || 0) + 1;
  if (Math.random() < GEMS.chestChance) { gainGems(1, true); toast('💎 The chest held a gem!', '#6fe3ff', 'gem'); sfx('gem'); }
  if (Math.random() < 0.35) { toast('🎁 Treasure chest!', '#ffd54f', 'chest'); gainItem(makeItem(G.floor, true)); }
  else {
    const g = incomeGold(CHEST.minutes) * (1 + CHEST.magnetGold * (G.perks.magnet || 0)) * (1 + CHEST.hunterGold * baseLv('chesthunter'));
    G.gold += g; G.stats.gold += g; floater(c.x, VIEW.ground - 14 * VIEW.s, '+' + fmt(g) + 'g', '#ffd54f', true);
    toast(`🎁 Treasure chest! +${fmt(g)} gold`, '#ffd54f', 'chest');
  }
}
// about `minutes` worth of current income (with a floor for brand-new saves).
// G.rates.gold is real income, so it already includes every gold bonus: only the fallback estimate gets goldMult.
// (It used to multiply the real income by goldMult again, so chests and cookies paid out goldMult× too much.)
const incomeGold = minutes => Math.max(G.rates.gold * 60 * minutes, floorBase(G.floor).gold * 25 * minutes * heroStats().goldMult) / Math.max(1, buffMult('gold'));
function eatCookie() {
  const c = cookiePos(); RT.cookie = null; G.stats.cookies++;
  // Sweet Tooth makes the useless cookies (no effect, or a single penny) rarer
  const sweet = G.perks.sweet || 0, weight = k => k[0] * (!Object.keys(k[3]).length || k[3].flatGold ? Math.max(0.1, 1 - 0.09 * sweet) : 1);
  let x = Math.random() * COOKIES.reduce((a, k) => a + weight(k), 0), pickC = COOKIES[0];
  for (const k of COOKIES) { x -= weight(k); if (x <= 0) { pickC = k; break; } }
  const msg = applyCookie(pickC, weight);
  floater(c.x, c.y, '🍪', '#ffd54f', true);
  toast(`🍪 ${msg}`, '#ffcf40', 'cookie'); addLog(`🍪 ${msg}`);
  ui.dirty = true;
}
// a cookie's effect; returns the message. (The double cookie picks two good cookies and applies both)
function applyCookie(pickC, weight) {
  const [, id, text, ef] = pickC;
  bump('cookieSeen', id);
  let msg = text;
  if (ef.double) {
    const good = COOKIES.filter(k => k[3].buff || k[3].gold || k[3].item), tot = good.reduce((a, k) => a + k[0], 0);
    const wpick = () => { let x = Math.random() * tot; for (const k of good) { x -= k[0]; if (x <= 0) return k; } return good[0]; };  // (by their usual odds)
    const two = [wpick(), wpick()];
    return msg + ' ' + two.map(k => applyCookie(k, weight)).join(' · ');
  }
  if (ef.flatGold) G.gold += ef.flatGold;
  if (ef.gold) { const g = incomeGold(ef.gold); G.gold += g; G.stats.gold += g; msg += ` +${fmt(g)} gold`; }
  if (ef.buff) { const secs = ef.secs * labMult('cookieT'); G.buffs = G.buffs.filter(b => b.id !== id); G.buffs.push({ id, icon: ef.icon, label: ef.label, mult: ef.buff, t: secs, max: secs }); statCache = null; }  // (🍪 Sugar Chemistry: longer)
  if (ef.scrap) { const n = Math.round(ef.scrap * (1 + zoneTier(G.bestFloor))); G.scrap = (G.scrap || 0) + n; G.stats.scrap = (G.stats.scrap || 0) + n; msg += ` +${n} 🔩`; }
  if (ef.petXp) {
    const p = G.cos && G.cos.pet;
    if (p && p !== 'none') { const lv0 = petLvl(p); G.petXp[p] = (G.petXp[p] || 0) + ef.petXp; msg += ` ${COSMETICS.pet.items[p].name} +${ef.petXp} xp${petLvl(p) > lv0 ? ` (now level ${petLvl(p)}!)` : ''}`; if (petLvl(p) > lv0) dirtyStats(); }
    else { const g = incomeGold(3); G.gold += g; G.stats.gold += g; msg = `A pet treat… but no pet to give it to. +${fmt(g)} gold`; }
  }
  if (ef.dust) {
    if (featureOn('stars')) { const n = Math.max(1, ef.dust * zoneTier(G.bestFloor)); gainDust(n); msg += ` +${fmt(n)} ✧`; }
    else { const g = incomeGold(5); G.gold += g; G.stats.gold += g; msg = `Sparkly sprinkles! +${fmt(g)} gold`; }
  }
  if (ef.amulet) gainAmulet(makeAmulet());
  if (ef.item) { const it = makeItem(G.floor, true); it.r = Math.max(it.r, 2); gainItem(it); }
  if (ef.warp && !RT.isBoss) { G.floor += ef.warp; G.maxFloor = Math.max(G.maxFloor, G.floor); G.bestFloor = Math.max(G.bestFloor, G.floor); G.farm = false; RT.enemies = []; RT.queue = []; RT.proj = []; RT.phase = 'walk'; RT.walkT = 0.5; }
  else if (ef.warp) { msg = 'Shortcut… but a boss blocks the way. Have some gold instead.'; G.gold += incomeGold(3); }
  if (ef.souls) { const n = Math.max(1, Math.round(soulsFor(Math.max(G.maxFloor, REBIRTH_MIN_FLOOR)) * 0.1)); G.souls += n; msg += ` +${fmt(n)} ✦`; }
  if (ef.gems) { gainGems(GEMS.cookie); msg += ` +${GEMS.cookie} 💎`; }
  return msg;
}

// ---------------- upgrades & automation ----------------
// past its max, a Mastery upgrade continues from its last price at MASTERY_GROWTH per level
// price jumps: ×BAL.stepMult every BAL.stepEvery levels (Mastery levels count too), so each floor buys a
// little less than the last and walls appear by themselves
const costAt = (k, l) => {
  const U = UPGRADES[k], step = Math.pow(BAL.stepMult, Math.floor(l / BAL.stepEvery));
  if (U.mastery && l >= U.max) return Math.ceil(U.base * Math.pow(U.growth, U.max) * Math.pow(MASTERY_GROWTH, l - U.max) * step);
  return Math.ceil(U.base * Math.pow(U.growth, l) * step);
};
const upgCost = k => costAt(k, G.upg[k]);
// buy mode ×1 / ×10 / Max: how many levels one click buys, and what they cost together
function upgBulk(k) {
  const U = UPGRADES[k], mode = G.settings.buyMode || 1, cap = U.max && !U.mastery ? U.max : Infinity;
  let n = 0, cost = 0, l = G.upg[k];
  while (l < cap && (mode === 'max' ? cost + costAt(k, l) <= G.gold : n < mode) && n < 1000) { cost += costAt(k, l); l++; n++; }
  if (mode === 'max' && !n && l < cap) { n = 1; cost = costAt(k, l); }  // show the next level's price when nothing is affordable
  return { n, cost };
}
function buyUpgradeBulk(k) {
  const { n, cost } = upgBulk(k); if (!n || G.gold < cost) return;
  for (let i = 0; i < n; i++) if (!buyUpgrade(k)) break;
}
const upgMaxed = k => UPGRADES[k].max && !UPGRADES[k].mastery && G.upg[k] >= UPGRADES[k].max;
function buyUpgrade(k) {
  if (upgMaxed(k) || !upgUnlocked(k) || chalRule('noUpg')) return false;
  const c = upgCost(k); if (G.gold < c) return false;
  const before = heroStats().hp;
  G.gold -= c; G.upg[k]++; bump('upgBought'); statCache = null; ui.dirty = true;
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  return true;
}
// upgrades switched off for auto-buy (the A toggle on each upgrade row)
const autoSkipped = k => !!(G.settings.autoSkip && G.settings.autoSkip[k]);
// auto-buy: always the cheapest option — upgrades, plus Forge reinforcing when that's switched on too
function autoBuy() {
  for (let i = 0; i < 100; i++) {
    let best = null, cost = Infinity;
    if (G.settings.autoUpg && featureOn('autoUpg')) for (const k in UPGRADES) if (upgUnlocked(k) && !upgMaxed(k) && !autoSkipped(k) && upgCost(k) < cost) { best = () => buyUpgrade(k); cost = upgCost(k); }
    if (G.settings.autoForge && featureOn('autoForge')) for (const s in SLOTS) if (forgeCost(s) < cost) { best = () => reinforce(s); cost = forgeCost(s); }
    if (!best || !best()) return;
  }
}
// ---------------- ⚒ Forge: reinforce gear slots, buy mystery chests ----------------
const forgeMult = s => Math.pow(labMult('forge') > 1 ? labMult('forge') : FORGE.mult, (G.forge && G.forge[s]) || 0);  // (⚒ Metallurgy: ×1.06)
const anvil = () => hasRelic('anvil') ? 0.75 : 1;  // ⚒ Masterwork Anvil
const forgeCost = s => Math.ceil(FORGE.base * Math.pow(FORGE.growth, G.forge[s] || 0) * anvil());
// 🔩 scrap from selling Rare+ items (by rarity, plus a bit per modifier)
const scrapFor = it => { const base = SCRAP.perRarity[it.r] ?? SCRAP.perRarity[SCRAP.perRarity.length - 1]; return base ? base + SCRAP.mod * modsOf(it).length : 0; };
// (🔩 Scrap Harvest: ×3; items found on replayed floors: ×REPLAY_SCRAP)
function salvage(it) {
  const x = scrapFor(it) * eventFx('scrap') * (it.rep ? REPLAY_SCRAP : 1), n = Math.floor(x) + (Math.random() < x % 1 ? 1 : 0);
  if (n) { G.scrap = (G.scrap || 0) + n; G.stats.scrap = (G.stats.scrap || 0) + n; }
}
const rarityCost = (base, it) => base * Math.pow(it.r + 1, 1.5);
// ⚒ Reforge: roll new bonus stats for a worn item, then keep them or revert. Costs scrap (more for rarer items and
// every reforge of the same item)
const reforgeCost = s => { const it = G.hero.gear[s]; return it ? Math.ceil(rarityCost(REFORGE.base, it) * Math.pow(REFORGE.growth, it.reforges || 0) * anvil()) : Infinity; };
function reforge(s) {
  const it = G.hero.gear[s], c = reforgeCost(s); if (!it || it.pending || G.scrap < c || !featureOn('forge')) return;
  G.scrap -= c; it.reforges = (it.reforges || 0) + 1; bump('reforges');
  const old = it.aff; rollAffixes(it); it.pending = it.aff; it.aff = old;  // the new roll waits for Keep / Revert
  ui.dirty = true;
}
function reforgeChoose(s, keep) {
  const it = G.hero.gear[s]; if (!it || !it.pending) return;
  const before = heroStats().hp;
  if (keep) it.aff = it.pending;
  delete it.pending; statCache = null; ui.dirty = true;
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  if (keep) addLog(`⚒ Reforged ${nameHtml(it)}`);
}
// 🎲 how likely one reforge is to make a worn item better: REFORGE_SAMPLES test rolls of its bonus stats, compared with
// what it has now (cached per item roll; refreshed every 30s since the rest of your gear and stats change too)
// (300 samples took ~75ms per item: a visible hitch with the Reforge tab open)
const REFORGE_SAMPLES = 150, reforgeOdds = {};
function reforgeChance(s) {
  const it = G.hero.gear[s]; if (!it) return null;
  const key = it.id + ':' + JSON.stringify(it.aff), c = reforgeOdds[s], now = Date.now();
  if (c && c.key === key && now - c.t < 30000) return c;
  const cur = rating(heroStats()); let up = 0, sum = 0;
  for (let i = 0; i < REFORGE_SAMPLES; i++) {
    const t = Object.assign({}, it, { aff: {} }); rollAffixes(t);
    const g = rating(computeStats(Object.assign({}, G.hero.gear, { [s]: t }))) / cur - 1;
    if (g > 0) { up++; sum += g; }
  }
  return (reforgeOdds[s] = { key, t: now, p: up / REFORGE_SAMPLES, avg: up ? sum / up : 0 });
}
// 🎲 auto-reforge (once a second, for each slot switched on): keep the new roll if it's better, revert if not.
// Only runs while you're looking at Forge → Reforge (anything else switches it off). Each item switched on may spend
// AUTO_REFORGE_BUDGET of the scrap you had when the session began (2 items: 10% in total), then that item stops.
// Also skips items below the stop chance (setting autoReforgeStop, %). Not saved: a restart starts with it off.
const AUTO_REFORGE_BUDGET = 0.05;
const autoRef = { slots: {}, start: 0 };  // slots: slot → scrap it has spent this session
const autoRefOn = () => Object.keys(autoRef.slots).length > 0;
function setAutoReforge(s, on) {
  if (on && !autoRefOn()) autoRef.start = G.scrap || 0;  // a new session
  if (on) autoRef.slots[s] = autoRef.slots[s] || 0; else delete autoRef.slots[s];
}
const autoRefSpent = () => Object.values(autoRef.slots).reduce((a, b) => a + b, 0);
function stopAutoReforge(why) {
  if (!autoRefOn()) return;
  const spent = autoRefSpent(); autoRef.slots = {};
  toast(`🎲 Auto-reforge stopped: ${why}`, '#b388ff'); addLog(`🎲 Auto-reforge stopped: ${why} (spent 🔩${fmt(spent)})`); ui.dirty = true;
}
const autoRefBudget = () => Math.floor(autoRef.start * AUTO_REFORGE_BUDGET);  // per item
// (checked on every panel / tab change too, so it stops the moment you look elsewhere)
const autoRefViewCheck = () => { if (autoRefOn() && (ui.panel !== 'forge' || tabStore().forge !== 'reforge')) { stopAutoReforge('you left the Reforge tab'); return false; } return true; };
function autoReforge() {
  if (!autoRefOn() || !autoRefViewCheck()) return;
  if (!featureOn('forge')) return;
  const stop = G.settings.autoReforgeStop || 0;
  for (const s in autoRef.slots) {
    const it = G.hero.gear[s];
    if (!it || it.pending || G.scrap < reforgeCost(s)) continue;
    if (stop && reforgeChance(s).p * 100 < stop) continue;
    if (autoRef.slots[s] + reforgeCost(s) > autoRefBudget()) {  // this item's share is used up: just this one stops
      const spent = autoRef.slots[s]; delete autoRef.slots[s];
      toast(`🎲 Auto-reforge stopped on your ${s}: it used its ${AUTO_REFORGE_BUDGET * 100}% of your scrap (🔩${fmt(spent)})`, '#b388ff'); addLog(`🎲 Auto-reforge on your ${s} used its 🔩${fmt(spent)}`);
      ui.dirty = true; continue;
    }
    const cur = rating(heroStats());
    autoRef.slots[s] += reforgeCost(s);
    reforge(s); if (!it.pending) continue;
    const gain = rating(computeStats(Object.assign({}, G.hero.gear, { [s]: Object.assign({}, it, { aff: it.pending }) }))) / cur - 1;
    reforgeChoose(s, gain > 0); bump('autoReforges');
    if (gain > 0) floater(heroX(), VIEW.ground - 20 * VIEW.s, `🎲 ${SLOTS[s].icon} +${(gain * 100).toFixed(1)}%`, '#b388ff', true);
  }
}
// 🔨 Temper: raise an item (worn or stashed) to your best floor's item level, keeping everything else about it
// (was the current floor: after a rebirth or Awakening that's far below the gear you wear, so a stashed item that's
// better in itself could never be brought up to beat it)
const temperLevel = () => Math.max(G.floor, G.bestFloor);
const itemGap = it => it ? Math.max(0, temperLevel() - it.ilvl) : 0;
const itemTemperCost = it => it && itemGap(it) ? Math.ceil(rarityCost(TEMPER.base, it) * Math.sqrt(itemGap(it)) * anvil() * labMult('temper')) : Infinity;
function temperItem(it) {
  const c = itemTemperCost(it); if (!it || !itemGap(it) || G.scrap < c || !featureOn('forge')) return;
  const before = heroStats().hp, k = Math.pow(ITEM_FLOOR_GROWTH, itemGap(it));
  G.scrap -= c; if (it.atk) it.atk = Math.round(it.atk * k); if (it.hp) it.hp = Math.round(it.hp * k); it.ilvl = temperLevel(); bump('tempers');
  statCache = null; ui.dirty = true;
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  addLog(`🔨 Tempered ${nameHtml(it)} to item level ${it.ilvl}`);
}
const temperGap = s => itemGap(G.hero.gear[s]);
const temperCost = s => itemTemperCost(G.hero.gear[s]);
const temper = s => temperItem(G.hero.gear[s]);
// 🎒 stash: items you chose not to auto-sell (by rarity, or with a modifier / from a set), to temper and equip later
const STASH_MAX = 500;  // (was 100, then 250)
const stashMax = () => STASH_MAX + labAdd('stash');  // (🎒 Deep Pockets research: +250)
function keepsItem(it) {
  if (!featureOn('forge')) return false;
  const S = G.settings;
  // stashAlways = N: anything at least 1 in N rare (at drop time) is always kept, whatever the other rules say (0 = off)
  const always = S.stashAlways ?? 1e5;
  if (always && itemOdds(it) <= 1 / always) return true;
  if (!((S.keepR && S.keepR[it.r]) || (S.keepMods && modsOf(it).length) || (S.keepSets && it.set))) return false;
  // quality rule (stashMinGain, in %; -99 = off): only keep it if, once tempered, it would be at most that much worse
  // than what you wear in its slot
  const min = S.stashMinGain ?? -99;
  return min <= -99 || temperedGain(it) * 100 >= min;
}
// an item's copy with its main stats moved to item level L (as if it had dropped there)
const atLevel = (it, L) => { if (!it || it.ilvl === L) return it; const k = Math.pow(ITEM_FLOOR_GROWTH, L - it.ilvl); return Object.assign({}, it, { atk: it.atk && Math.max(1, Math.round(it.atk * k)), hp: it.hp && Math.max(1, Math.round(it.hp * k)), ilvl: L }); };
// the stash's ▲/▼: this item against what you wear in its slot with both at the same item level, so it shows how much
// better the item itself is (rarity, rolls, modifiers), not which one dropped deeper. cache: per-slot baseline, per render
// (compared at your best floor's item level, so the numbers stay put while you replay floors)
function stashGain(it, cache = {}) {
  const L = G.bestFloor, s = it.slot;
  if (!cache[s]) { const gear = Object.assign({}, G.hero.gear, { [s]: atLevel(G.hero.gear[s], L) }); cache[s] = { gear, r: rating(computeStats(gear)) }; }
  return rating(computeStats(Object.assign({}, cache[s].gear, { [s]: atLevel(it, L) }))) / cache[s].r - 1;
}
// how your gear would compare with this item worn after 🔨 tempering it to your best floor (the keep rule's quality check)
const temperedGain = it => rating(computeStats(Object.assign({}, G.hero.gear, { [it.slot]: temperedCopy(it) }))) / rating(heroStats()) - 1;
// each stashed item's quality (it.q = stashGain) is cached: 500 items × a full stat calculation is too slow to redo on
// every drop or panel refresh. Refreshed when your gear or best floor changes, and at least once a minute.
const stashQKey = () => Object.values(G.hero.gear).map(i => i ? i.id + ':' + i.ilvl + ':' + (i.reforges || 0) : '-').join(',') + '@' + G.bestFloor;
function refreshStashQ(force) {
  const key = stashQKey();
  if (!force && ui.stashQKey === key && Date.now() - (ui.stashQAt || 0) < 60000 && (G.stash || []).every(x => x.q != null)) return;
  const cache = {}; for (const x of G.stash || []) x.q = stashGain(x, cache);
  ui.stashQKey = key; ui.stashQAt = Date.now();
}
// items that pass "always keep anything rarer than…" (they're only pushed out by another item that passes it)
const stashRare = it => { const a = G.settings.stashAlways ?? 1e5; return !!a && itemOdds(it) <= 1 / a; };
// force: keep it whatever the keep rules say (🔱 ascended items). When the stash is full, the new item replaces the
// worst unlocked one if it's better (that one is sold); otherwise the new one is sold
function stashIt(it, force) {
  if (!force && !keepsItem(it)) return false;
  G.stash = G.stash || [];
  it.q = stashGain(it);
  if (G.stash.length >= stashMax()) {
    refreshStashQ();
    const rare = stashRare(it);
    let worst = null;
    for (const x of G.stash) if (!x.locked && (rare || !stashRare(x)) && (!worst || x.q < worst.q)) worst = x;
    if (!worst || worst.q >= it.q) {
      if (!ui.stashFullWarned) { ui.stashFullWarned = true; toast(`🎒 Stash full (${stashMax()}): finds that aren't better than your worst stashed item are sold`, '#ffb74d'); }
      return false;
    }
    G.stash = G.stash.filter(x => x !== worst);
    const v = sellValue(worst); G.gold += v; salvage(worst);
    addLog(`🎒 Stash full: sold ${nameHtml(worst)} for ${fmt(v)}g to make room for a better item`);
  }
  G.stash.push(it); ui.dirty = true;
  return true;
}
const stashItem = id => (G.stash || []).find(x => x.id === id);
// equip a stashed item. auto: the old one goes back to the stash only if it meets your keep rules (else it's sold);
// by hand, it always goes back to the stash
function equipFromStash(id, auto) {
  const it = stashItem(id); if (!it || !canWear(it)) return;
  const before = heroStats().hp, old = G.hero.gear[it.slot];
  G.stash = G.stash.filter(x => x !== it);
  G.hero.gear[it.slot] = it; statCache = null; ui.dirty = true;
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  let where = '';
  if (old) {
    if (!auto) { old.q = stashGain(old); G.stash.push(old); where = ' · old one went to the stash'; }
    else if (stashIt(old)) where = ' · old one went to the stash';
    else { const v = sellValue(old); G.gold += v; salvage(old); where = ` · sold old for ${fmt(v)}g`; }
  }
  addLog(`🎒 ${auto ? 'Auto-equipped' : 'Equipped'} ${nameHtml(it)} from the stash${where}`);
  if (auto) toast(`🎒 Equipped from the stash: ${nameHtml(it)}`, RARITY[it.r].color);
}
// better gear waiting in the stash (e.g. after tempering it) is put on by itself: any stashed item that beats what you
// wear in its slot, as it is now, by more than EQUIP_MIN_GAIN. Only items whose quality (q) is ahead get the full check
function autoEquipStash() {
  if (!featureOn('forge') || !(G.stash || []).length) return;
  refreshStashQ();
  const cur = rating(heroStats()), best = {};
  for (const x of G.stash) {
    const worn = G.hero.gear[x.slot];
    if ((x.q <= 0 && worn && x.ilvl <= worn.ilvl) || !canWear(x)) continue;  // (worse and no deeper: can't be an upgrade)
    const g = rating(computeStats(Object.assign({}, G.hero.gear, { [x.slot]: x }))) / cur - 1;
    if (g > EQUIP_MIN_GAIN && (!best[x.slot] || g > best[x.slot].g)) best[x.slot] = { x, g };
  }
  for (const s in best) equipFromStash(best[s].x.id, true);
}
// 🔨 auto-temper (setting autoTemper): a stashed item that would beat what you wear once tempered to your best floor gets
// tempered (if you have the scrap), and autoEquipStash then puts it on. Per slot, the biggest upgrade wins
function autoTemperStash() {
  if (!G.settings.autoTemper || !featureOn('forge') || !(G.stash || []).length) return;
  refreshStashQ();
  const best = {};
  for (const x of G.stash) {
    if (!itemGap(x) || !canWear(x) || G.scrap < itemTemperCost(x)) continue;
    const worn = G.hero.gear[x.slot];
    if (worn && x.q <= 0 && worn.ilvl >= temperLevel()) continue;  // worse, and your gear is already at the temper level
    const g = temperedGain(x);
    if (g > EQUIP_MIN_GAIN && (!best[x.slot] || g > best[x.slot].g)) best[x.slot] = { x, g };
  }
  let n = 0;
  for (const s in best) { const it = best[s].x; if (G.scrap < itemTemperCost(it)) continue; temperItem(it); bump('autoTempers'); n++; }
  if (n) autoEquipStash();
}
// an item as it would be after 🔨 tempering it to your best floor's item level (a copy; the keep rule compares with this)
function temperedCopy(it) {
  const gap = itemGap(it); if (!gap) return it;
  const k = Math.pow(ITEM_FLOOR_GROWTH, gap);
  return Object.assign({}, it, { atk: it.atk && Math.round(it.atk * k), hp: it.hp && Math.round(it.hp * k), ilvl: temperLevel() });
}
function sellFromStash(id) {
  const it = stashItem(id); if (!it || it.locked) return;  // 🔒 locked items can't be sold
  G.stash = G.stash.filter(x => x !== it);
  const v = sellValue(it); G.gold += v; salvage(it); ui.stashFullWarned = false; ui.dirty = true;
  addLog(`Sold ${nameHtml(it)} from the stash for ${fmt(v)}g`);
}
// 🌙 share of your income earned while the game is closed: 40% + Dream Walker + Hourglass, never above 90%
const offlineEff = () => Math.min(OFFLINE_MAX + starAdd('offline') + labAdd('offline'), OFFLINE_BASE + DREAM_PER * (G.perks.dream || 0) + (hasRelic('hourglass') ? 0.25 : 0) + starAdd('offline') + labAdd('offline'));  // (✧ Wanderer and 🌙 Dream Engine raise both)
// 💎 one-off gem spends
function gemShop(k) {
  const S = GEM_SHOP[k]; if (!S || G.gems < S.cost) return;
  if (k === 'reroll') {
    const a = G.amulet; if (!a) return;
    const T = AMULET_TIERS[a.r], keys = Object.keys(AMULET_STATS), fx = {};
    const addFx = (st, s) => { fx[st] = Math.round(((fx[st] || 1) + AMULET_STATS[st].per * T.power * s * rand(0.85, 1.15)) * 1000) / 1000; };
    addFx(a.core, 1);
    for (let i = 0; i < T.charms + (hasRelic('lens') ? 1 : 0) + labAdd('charm'); i++) addFx(pick(keys.filter(x => x !== a.core)), 0.5);
    a.fx = fx; statCache = null;
    toast(`🎲 Rerolled: ${amuletFxText(a)}`, T.color);
  } else if (k === 'pet') { if (!unlockRandomPet('Summoned with gems')) return toast('🐾 You already have every pet!', '#ffb3e6'); }
  else if (k === 'cookie') { if (RT.cookie) return; RT.cookie = { fx: rand(0.35, 0.85), fy: rand(0.2, 0.55), t: 20 }; }
  else if (k === 'goldrush') { const g = incomeGold(10); G.gold += g; G.stats.gold += g; toast(`💰 Gold rush: +${fmt(g)} gold`, '#ffd54f'); }
  else if (k === 'frenzy') { G.buffs = G.buffs.filter(b => b.id !== 'gemfrenzy'); G.buffs.push({ id: 'gemfrenzy', icon: '⚔', label: 'Battle frenzy', mult: { atk: 1.5, spd: 1.5 }, t: 180, max: 180 }); statCache = null; }
  else if (k === 'warp') {
    if (RT.rush) return toast('🌀 Not during a Boss Rush', '#ff6b6b');
    if (RT.isBoss && RT.phase === 'fight') return toast('🌀 Not during a boss fight', '#ff6b6b');
    let n = 0; while (n < 5 && !isBossFloor(G.floor + n + 1)) n++;
    if (!n) return toast('🌀 A boss is next: beat it first', '#ff6b6b');
    G.floor += n; G.maxFloor = Math.max(G.maxFloor, G.floor); G.bestFloor = Math.max(G.bestFloor, G.floor); G.farm = false;
    RT.enemies = []; RT.queue = []; RT.proj = []; RT.phase = 'walk'; RT.walkT = 0.5; toast(`🌀 Warped ahead ${n} floor${n > 1 ? 's' : ''}`, '#7df9ff');
  }
  else if (k === 'scrapbox') { G.scrap = (G.scrap || 0) + 40; }
  else if (k === 'soulsnack') { const n = Math.max(1, Math.round(soulsFor(Math.max(G.bestFloor, REBIRTH_MIN_FLOOR)) * 0.05)); G.souls += n; toast(`✦ +${fmt(n)} souls`, '#b388ff'); }
  else if (k === 'rebounty') {
    const B = G.bounty, b = B && B.list.find(x => !x.done); if (!b) return toast('📅 No unfinished bounty to swap', '#ff6b6b');
    const T = pick(BOUNTY_TYPES.filter(t => !B.list.some(x => x.type === t.id)));
    Object.assign(b, { type: T.id, n: pick(T.n), start: T.stat(G) });
  }
  G.gems -= S.cost; ui.dirty = true;
}
function reinforce(s) {
  const c = forgeCost(s); if (G.gold < c || !featureOn('forge')) return false;
  const before = heroStats().hp;
  G.gold -= c; G.forge[s] = (G.forge[s] || 0) + 1; bump('reinforces'); statCache = null; ui.dirty = true;
  if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
  return true;
}
// 📦 scrap chests: an item from this floor with a guaranteed minimum rarity (and better modifier odds for the bigger ones)
const scrapChestCost = k => Math.ceil(SCRAP_CHESTS[k].cost * Math.pow(CHEST_GROWTH, (G.chestRun || {})[k] || 0) * anvil());
// 🔷 Essence Chest: unlocked on lap C.lap; its Essence price, and the rarity that price buys
const chestOpen = k => { const C = SCRAP_CHESTS[k]; return featureOn('chestShop') && (!C.lap || zoneTier(G.bestFloor) + 1 >= C.lap); };
const essenceChestSpend = () => Math.max(1, Math.ceil(essence() * ESSENCE_CHEST.share));
function essenceChestTier(spent = essenceChestSpend()) {
  const level = Math.log10(1 + spent / ESSENCE_CHEST.per), top = RARITY.length - 1;
  const r = Math.min(top, ESSENCE_CHEST.base + Math.floor(level));
  return { r, next: r < top ? level % 1 : 0 };  // next = chance of one tier higher
}
function buyScrapChest(k) {
  const C = SCRAP_CHESTS[k], c = scrapChestCost(k); if (!C || G.scrap < c || !chestOpen(k)) return;
  const spent = C.essence ? essenceChestSpend() : 0;
  if (C.essence && essence() < spent) return;
  const { it, gain } = chestRoll(k);  // (rolled before the Essence goes, with the Essence you're about to spend)
  G.scrap -= c; bump('mysteryBought');
  if (spent) {
    const before = heroStats().hp; G.essence = essence() - spent; G.stats.essenceSpent = (G.stats.essenceSpent || 0) + spent; dirtyStats();
    if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
    addLog(`🔷 Sacrificed ${essHtml(spent)} Essence to an Essence Chest (${essHtml(essence())} left)`);
  }
  G.chestRun = G.chestRun || {}; G.chestRun[k] = (G.chestRun[k] || 0) + 1;  // pricier each time this run
  it.chest = 1;  // (always kept: equipped if it's better as it is, otherwise it goes to the stash, never auto-sold)
  toast(`${C.icon} ${C.name}: ${nameHtml(it)}${gain > EQUIP_MIN_GAIN ? ` <span class="up">(+${(gain * 100).toFixed(0)}% once tempered)</span>` : ''}`, RARITY[it.r].color);
  gainItem(it);
}
// one chest's item: rolled like a boss drop, with only the rarest modifiers in the pool; attuned chests roll `attune`
// items and give the one that improves your current gear the most (compared as if tempered to your best floor)
function chestRoll(k) {
  const C = SCRAP_CHESTS[k], cur = rating(heroStats()), et = C.essence && essenceChestTier();
  // (🔷 the Essence Chest's rarity is set by the Essence spent: that tier, or one more with a chance, never higher)
  const roll = () => { const r = et && Math.min(RARITY.length - 1, et.r + (Math.random() < et.next ? 1 : 0));
    return makeItem(Math.max(1, Math.round(G.floor * CHEST_ILVL)), true, { minR: et ? r : C.minR, maxR: et ? r : C.maxR, modLuck: C.mod || 1, jackpot: CHEST_JACKPOT, topMods: CHEST_TOP_MODS, picks: Math.ceil((C.mod || 1) / CHEST_PICK_PER) }); };
  let best = null;
  for (let i = 0; i < (C.attune || 1); i++) {
    const it = roll(), gain = rating(computeStats(Object.assign({}, G.hero.gear, { [it.slot]: temperedCopy(it) }))) / cur - 1;
    if (!best || gain > best.gain) best = { it, gain };
  }
  return best;
}
// 💡 each chest's chance to beat your gear right now (once tempered), from test rolls. The estimate keeps growing (CHEST_STEP
// more rolls per refresh, up to CHEST_SAMPLES) and only starts over when your gear changes or your best floor crosses a
// CHEST_BUCKET-floor step, so it settles instead of jumping around. (It used to reroll 40 samples on every new floor:
// pure sampling noise of about ±7%, and a stat-math hitch per floor.)
const CHEST_SAMPLES = 200, CHEST_STEP = 10, CHEST_BUCKET = 25, chestOddsCache = {};
const chestKey = () => Object.values(G.hero.gear).map(i => i ? i.id + ':' + i.ilvl + ':' + (i.reforges || 0) + ':' + JSON.stringify(i.aff) : '-').join(',') + '@' + Math.floor(G.bestFloor / CHEST_BUCKET);
function chestOdds(k) {
  const key = chestKey() + (SCRAP_CHESTS[k].essence ? '#' + essence() : '');
  let c = chestOddsCache[k];
  if (!c || c.key !== key) c = chestOddsCache[k] = { key, n: 0, up: 0, sum: 0 };
  if (c.n < CHEST_SAMPLES) {
    const nid = G.nid, rolls = c.n ? CHEST_STEP : 4 * CHEST_STEP;  // (a bigger first batch, so the first number is already close)
    for (let i = 0; i < rolls; i++) { const { gain } = chestRoll(k); c.n++; if (gain > EQUIP_MIN_GAIN) { c.up++; c.sum += gain; } }
    G.nid = nid;  // (test rolls leave no trace)
  }
  c.p = c.up / c.n; c.avg = c.up ? c.sum / c.up : 0;
  return c;
}
function autoPerks() {
  const order = ['soul', 'soul', 'headstart', 'hunter', 'companion', 'scholar', 'soul', 'bounty', 'slayer', 'phoenix', 'trophy', 'sweet', 'magnet', 'refine', 'relentless', 'dream'];
  for (let i = 0; i < 200; i++) {
    const k = order.find(p => perkUnlocked(p) && !(PERKS[p].max && G.perks[p] >= perkMax(p)) && G.souls >= perkCost(p));
    if (!k) return; buyPerk(k);
  }
}
function automation() {
  if (G.settings.autoUpg || G.settings.autoForge) autoBuy();
  autoReforge();
  // 🧪 research runs on real time (this runs once a second; long gaps are caught up at start-up)
  const now = Date.now(), dsec = Math.min(5, Math.max(0, (now - (ui.labLast || now)) / 1000)); ui.labLast = now; labTick(dsec);
  autoExpeditions();  // 🕊
  // ☠ Rush Drill: start a Boss Rush by itself when it's ready (not in the middle of a boss fight)
  if (G.settings.autoRush && hasLab('autoRush') && featureOn('rush') && !G.challenge && RT && !RT.rush && !(RT.isBoss && RT.phase === 'fight') && rushWait() <= 0) startRush();
  // 🎒 put on better gear waiting in the stash (every 15s: it's a full stat check per stashed item)
  if (Date.now() - (ui.autoEqAt || 0) > 15000) { ui.autoEqAt = Date.now(); autoEquipStash(); autoTemperStash(); }
  // 🏁 a challenge run is a separate game: its achievements count quietly (for its own +1% each, like a fresh
  // game gets; no gems, not added to your save's), no bounties, and it watches the goal
  // 🛡 full sets worn (for the set achievements)
  for (const [id, n] of Object.entries(heroStats().sets || {})) if (n >= 4) { const f = G.stats.setsFull || (G.stats.setsFull = {}); if (!f[id]) { f[id] = Date.now(); toast(`🛡 Full <b style="color:${GEAR_SETS[id].color}">${GEAR_SETS[id].name}</b> set!`, GEAR_SETS[id].color); } }
  if (G.challenge) { checkAchievements(true); announceUnlocks(); checkChallenge(); return; }
  if (G.settings.autoRebirth && featureOn('rebirth') && !(RT && RT.rush) && soulsFor(G.maxFloor) > 0 && G.stuckT >= G.settings.rebirthStuck * 60) {
    rebirth(true);
    if (G.settings.autoPerks) autoPerks();
  }
  checkAchievements();
  announceUnlocks();
  checkBounties();
}
// ---------------- 📅 daily bounties ----------------
const BOUNTY_AT = 10;  // best floor that unlocks them
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
// three different goals each day; progress counts from the moment they were handed out
function ensureBounties() {
  if (G.bestFloor < BOUNTY_AT) return;
  if (G.bounty && G.bounty.day === today()) return;
  const types = BOUNTY_TYPES.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  G.bounty = { day: today(), bonus: false, list: types.map(T => ({ type: T.id, n: pick(T.n), start: T.stat(G), done: false })) };
  if (!headless) toast('📅 New daily bounties are up (🛡 Hero → 💎 → Daily)', '#ffe082', 'bounty');
}
const bountyProgress = b => { const T = BOUNTY_TYPES.find(t => t.id === b.type); return T ? Math.max(0, T.stat(G) - b.start) : 0; };
function checkBounties() {
  ensureBounties();
  const B = G.bounty; if (!B) return;
  for (const b of B.list) {
    if (b.done || bountyProgress(b) < b.n) continue;
    b.done = true; gainGems(BOUNTY_REWARD.each); bump('bountiesDone');
    const T = BOUNTY_TYPES.find(t => t.id === b.type);
    toast(`📅 Bounty done: ${T.text(b.n)} (💎${BOUNTY_REWARD.each})`, '#ffe082', 'bounty'); sfx('bounty'); addLog(`📅 Bounty done: ${T.text(b.n)}`);
  }
  if (!B.bonus && B.list.every(b => b.done)) { B.bonus = true; gainGems(BOUNTY_REWARD.all); toast(`📅 All of today's bounties done! +💎${BOUNTY_REWARD.all}`, '#ffe082', 'bounty'); }
}
// 🏅 achievements: checked once a second
function checkAchievements(silent) {
  let got = 0;
  for (const A of ACHIEVEMENTS) {
    if (G.ach[A.id] || !A.test(G)) continue;
    G.ach[A.id] = Date.now(); got++;
    if (silent) continue;
    gainGems(GEMS.perAch);
    const cos = A.cos && cosmeticById(A.cos);
    toast(`🏅 Achievement: <b>${A.name}</b> <span class="dim">(+${ACH_BONUS * 100}% power, 💎${GEMS.perAch}${cos ? `, 🎨 ${cos.name}` : ''})</span>`, '#ffcf40', 'ach'); sfx('ach');
    addLog(`🏅 ${A.name}: ${A.desc}${cos ? ` · unlocked ${cos.name} in the Wardrobe` : ''}`);
  }
  if (got) dirtyStats();
  return got;
}
// ⬆ auto-buy starts off the moment it unlocks in a game (a fresh save or a challenge run), with every upgrade
// excluded: you switch it on and pick the upgrades yourself. (autoUpgInit: done for this game)
function initAutoUpg() {
  if (G.autoUpgInit || !featureOn('autoUpg')) return;
  G.autoUpgInit = true; G.settings.autoUpg = false;
  G.settings.autoSkip = Object.fromEntries(Object.keys(UPGRADES).map(k => [k, true]));
  toast('⬆ Auto-buy is off to start with, and every upgrade is excluded: switch it on in ⬆ Upgrades and tap an upgrade\'s <b>A</b> to include it', '#7df9ff', 'unlock');
}
// new upgrades, perks and features: announce each once
function announceUnlocks() {
  initAutoUpg();
  // several at once (e.g. the first perks) share one message
  const fresh = (prefix, keys) => keys.filter(k => !G.seen[prefix + k] && (G.seen[prefix + k] = 1));
  const say = html => { toast(html, '#7df9ff', 'unlock'); addLog(html); ui.dirty = true; };
  const u = fresh('upg_', Object.keys(UPGRADES).filter(upgUnlocked));
  if (u.length) say(`⬆ New upgrade${u.length > 1 ? 's' : ''}: ${u.map(k => `${UPGRADES[k].icon} ${UPGRADES[k].name}`).join(', ')}`);
  fresh('feat_', Object.keys(FEATURES).filter(featureOn)).forEach(k => say(FEATURES[k].name));
  const p = fresh('perk_', Object.keys(PERKS).filter(perkUnlocked));
  if (p.length) say(`✦ New rebirth perk${p.length > 1 ? 's' : ''}: ${p.map(k => PERKS[k].name).join(', ')}`);
}
// mark everything already unlocked as announced (older saves, so they don't get a burst of toasts)
function markSeen() {
  for (const k in UPGRADES) if (upgUnlocked(k)) G.seen['upg_' + k] = 1;
  for (const k in FEATURES) if (featureOn(k)) G.seen['feat_' + k] = 1;
  for (const k in PERKS) if (perkUnlocked(k)) G.seen['perk_' + k] = 1;
  for (const k in SKILLS) if ((G.stats.maxLvl || G.hero.lvl) >= SKILLS[k].lvl) G.seen['skill_' + k] = 1;
}

// ---------------- loot: auto-equip upgrades, auto-sell the rest ----------------
// lowest rarity still in the drop pool (Refined Taste removes tiers from the bottom)
const minRarity = () => Math.min(RARITY.length - 1, G.perks.refine || 0);
// jackpot: × weight of the jackpot tiers (Ethereal and up), for scrap chests
function rollRarity(boss, minR = 0, jackpot = 1) {
  const luck = heroStats().lootMult, floor = Math.max(minRarity(), minR);
  const roll = () => {
    // removed tiers get no weight; the rest share the pool in their usual proportions
    const w = RARITY.map((r, i) => (i < floor ? 0 : i === 0 ? r.w : r.w * luck) * (i >= ETHEREAL_INDEX ? jackpot : 1));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0 && w[i] > 0) return i; }
    return RARITY.length - 1;
  };
  let r = roll();
  if (boss) r = Math.max(1, r, roll());
  return r;
}
// items per loot drop: bosses drop 3; each Bountiful level is a 20% chance of one more
// (every full 100% is a guaranteed extra item)
const bountyExtra = () => 0.2 * (G.perks.bounty || 0);
const itemsPerDropAvg = boss => (boss ? 3 + (hasRelic('mark') ? 1 : 0) : 1) + bountyExtra();
const itemsPerDrop = boss => { const x = bountyExtra(); return (boss ? 3 + (hasRelic('mark') ? 1 : 0) : 1) + Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); };

// ---------------- 📿 amulets ----------------
const amuletChance = () => AMULET_CHANCE * (1 + 0.25 * (G.perks.trophy || 0)) * (hasRelic('mark') ? 1.5 : 1) * eventFx('amulet');  // (🌑 Eclipse)
function maybeAmulet() { if (Math.random() < amuletChance()) gainAmulet(makeAmulet()); }
function makeAmulet() {
  let x = Math.random() * AMULET_TIERS.reduce((a, t) => a + t.w, 0), r = 0;
  for (let i = 0; i < AMULET_TIERS.length; i++) { x -= AMULET_TIERS[i].w; if (x <= 0) { r = i; break; } }
  const T = AMULET_TIERS[r], keys = Object.keys(AMULET_STATS), core = pick(keys), fx = {};
  const addFx = (k, strength) => { fx[k] = Math.round(((fx[k] || 1) + AMULET_STATS[k].per * T.power * strength * rand(0.85, 1.15)) * 1000) / 1000; };
  addFx(core, 1);
  for (let i = 0; i < T.charms + (hasRelic('lens') ? 1 : 0) + labAdd('charm'); i++) addFx(pick(keys.filter(k => k !== core)), 0.5);  // 🔍 Jeweler's Lens / 💠 Gemcutting: one more each
  return { id: G.nid++, amulet: true, r, core, fx, name: `${T.name} Amulet of ${AMULET_STATS[core].name}`, floor: G.floor, at: Date.now() };
}
// how good an amulet is overall: each bonus in log terms, weighted by how much that stat matters
const amuletScore = a => a ? Object.entries(a.fx).reduce((s, [k, m]) => s + Math.log(m) * AMULET_STATS[k].w, 0) : 0;
function gainAmulet(a) {
  G.stats.amulets = (G.stats.amulets || 0) + 1;
  G.stats.bestAm = Math.max(G.stats.bestAm == null ? -1 : G.stats.bestAm, a.r);
  const T = AMULET_TIERS[a.r], s = amuletScore(a), twin = hasRelic('twin');
  // with Twin Chains the second slot holds the runner-up (a replaced best amulet slides down to it)
  if (s > amuletScore(G.amulet) || (twin && s > amuletScore(G.amulet2))) {
    const before = heroStats().hp;
    if (s > amuletScore(G.amulet)) { if (twin && amuletScore(G.amulet) > amuletScore(G.amulet2)) G.amulet2 = G.amulet; G.amulet = a; }
    else G.amulet2 = a;
    statCache = null;
    if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
    toast(`📿 Amulet equipped: ${amuletName(a)}`, T.color, 'amulet'); sfx('rare'); addLog(`📿 Equipped ${amuletName(a)} (${amuletFxText(a)})`);
  } else {
    toast(`📿 Found ${amuletName(a)} <span class="dim">(yours is better)</span>`, T.color, 'amulet'); addLog(`📿 Found ${amuletName(a)}, kept your current one`);
  }
  ui.dirty = true;
}
function amuletName(a) {
  const T = AMULET_TIERS[a.r];
  if (!T.shine) return `<span style="color:${T.color}">${a.name}</span>`;
  return `<span class="mod ${T.rainbow ? 'rainbow' : 'shine'}" style="--c:${T.color};--m:#ffffff">${a.name}</span>`;
}
const amuletFxText = a => Object.entries(a.fx).sort((x, y) => (x[0] === a.core ? -1 : y[0] === a.core ? 1 : 0)).map(([k, m]) => `×${m.toFixed(2)} ${AMULET_STATS[k].desc}`).join(' · ');
// opts (scrap chests): minR = lowest rarity it can be, modLuck = × modifier chance
// 🌠 Fate: every dropped item counts toward each jackpot tier (FATE); one that reaches its count forces the drop to
// that tier (the rarest one due wins). Getting a tier, by luck or by fate, resets its count and every lower one's.
function applyFate(r) {
  const F = G.fate || (G.fate = {});
  let forced = null;
  const step = starMult('fate') * labMult('fate');  // (✧ Seer and 🔭 Astral Lens: counts faster)
  for (const t of Object.keys(FATE).map(Number).sort((a, b) => b - a)) if (t > r && (F[t] || 0) + step >= FATE[t]) { forced = t; break; }
  if (forced != null) r = forced;
  for (const t in FATE) F[t] = r >= +t ? 0 : (F[t] || 0) + step;
  return { r, forced: forced != null };
}
function makeItem(ilvl, boss, opts = {}) {
  let r = Math.min(opts.maxR ?? Infinity, rollRarity(boss, opts.minR || 0, opts.jackpot ?? 1)), fated = false;
  if (opts.maxR == null && !opts.minR) ({ r, forced: fated } = applyFate(r));  // (scrap chests don't count)
  const R = RARITY[r];
  const slot = pick(Object.keys(SLOTS));
  const base = Math.pow(ITEM_FLOOR_GROWTH, ilvl - 1) * R.mult;
  const it = { id: G.nid++, slot, r, ilvl, aff: {} };
  if (RT && replaying() && !opts.minR) it.rep = 1;  // found on a replayed floor: less scrap when sold (REPLAY_SCRAP)
  for (const stat in SLOT_BASE[slot]) it[stat] = Math.max(1, Math.round(SLOT_BASE[slot][stat] * base * rand(0.85, 1.15)));
  const power = rollModifier(boss, 'power', opts.modLuck, opts.topMods, opts.picks), flavour = rollModifier(boss, 'flavour', opts.modLuck, opts.topMods, opts.picks);
  it.name = `${pick(PREFIXES[r])} ${pick(SLOTS[slot].names)}${r >= 2 ? ' ' + pick(SUFFIXES) : ''}`;
  if (power) it.mod = power.id;
  if (flavour) it.flavour = flavour.id;
  rollAffixes(it);
  // 🛡 some Epic+ items belong to a gear set
  if (r >= 3 && Math.random() < SET_CHANCE) it.set = rollSet();
  // odds of this exact rarity + modifier combination at the moment it dropped
  it.odds = rarityProbs(boss)[r] * (power ? modProbs(boss, 'power')[power.id] : 1) * (flavour ? modProbs(boss, 'flavour')[flavour.id] : 1);
  if (fated) {
    it.fated = true; bump('fated');
    toast(`🌠 <b>Fate!</b> After ${fmt(FATE[r])} items, a guaranteed <b style="color:${R.color}">${R.name}</b> drop`, R.color); sfx('rare');
    addLog(`🌠 Fate delivered a guaranteed ${R.name} item`);
  }
  for (const m of [power, flavour]) {
    if (!m) continue;
    if (it.atk) it.atk = Math.round(it.atk * m.mult);
    if (it.hp) it.hp = Math.round(it.hp * m.mult);
  }
  return it;
}
// 🛡 which set an item belongs to: half the time one of the zone's home sets (where it was found), else any set
const zoneSets = z => Object.keys(GEAR_SETS).filter(id => (GEAR_SETS[id].zones || []).includes(z.name));
function rollSet() {
  const home = zoneSets(RT ? curZone() : zoneOf(G.floor));
  return home.length && Math.random() < SET_HOME ? pick(home) : pick(Object.keys(GEAR_SETS));
}
// an item's bonus stats: every stat type once (random order), extra rolls stack onto stats it already has,
// plus its modifiers' fixed bonuses. (⚒ Reforge calls this again to reroll them)
function rollAffixes(it) {
  const r = it.r, R = RARITY[r], power = it.mod && MOD_BY_ID[it.mod], flavour = it.flavour && MOD_BY_ID[it.flavour];
  it.aff = {};
  const all = Object.keys(AFFIXES).sort(() => Math.random() - 0.5), n = R.affixes + ((power && power.extra) || 0);
  for (let i = 0; i < n; i++) {
    const k = i < all.length ? all[i] : pick(all), A = AFFIXES[k];
    it.aff[k] = Math.round(((it.aff[k] || 0) + rand(A.min, A.max) * affixMult(r)) * 10) / 10;
  }
  for (const m of [power, flavour]) if (m) for (const k in m.aff || {}) it.aff[k] = Math.round(((it.aff[k] || 0) + m.aff[k]) * 10) / 10;
}
// power and flavour each roll on their own; loot bonuses help a little (square root), bosses & chests double the odds
// top (scrap chests): the usual chance of getting a modifier of this kind, but it always lands on one of the `top`
// rarest ones (picked by their own odds, so Radiant is common among them and Void-Kissed very rare)
// picks: that many picks among the `top`, keeping the rarest (the big chests)
function rollModifier(boss, kind, extra = 1, top = Infinity, picks = 1) {
  const luck = modLuck(boss) * extra;
  let got = null;
  for (const m of MODIFIERS) if (m.kind === kind && Math.random() < luck / m.oneIn) { got = m; break; }
  if (!got || top === Infinity) return got;
  const pool = MODIFIERS.filter(m => m.kind === kind).slice(0, top), tot = pool.reduce((a, m) => a + 1 / m.oneIn, 0);
  const one = () => { let x = Math.random() * tot; for (const m of pool) { x -= 1 / m.oneIn; if (x <= 0) return m; } return pool[pool.length - 1]; };
  let best = one();
  for (let i = 1; i < picks; i++) { const m = one(); if (m.oneIn > best.oneIn) best = m; }
  return best;
}
// ---- exact drop odds (mirror rollRarity / rollModifier) ----
function rarityProbs(boss) {
  const luck = heroStats().lootMult, floor = minRarity();
  const w = RARITY.map((r, i) => i < floor ? 0 : i === 0 ? r.w : r.w * luck), tot = w.reduce((a, b) => a + b, 0);
  const p = w.map(x => x / tot);
  if (!boss) return p;
  // boss: best of two rolls, at least Uncommon → P(result ≤ k) = F(k)²
  let c = 0; const F = p.map(x => (c += x));
  return p.map((_, k) => k < 1 ? 0 : Math.pow(F[k], 2) - (k === 1 ? 0 : Math.pow(F[k - 1], 2)));
}
// loot bonuses only nudge modifier odds (logarithmically: ×16,000 loot ≈ ×3 modifiers) so they stay special;
// bosses & chests double them
const modLuck = boss => (1 + Math.log10(Math.max(1, heroStats().lootMult)) / 2) * (boss ? 2 : 1) * (1 + 0.02 * baseLv('keeneye')) * starMult('mod') * oathMult('mod') * eventFx('mod') * buffMult('mod');  // 👁 Keen Eye, ✧ Seer, ⚜ Hunter, 🍀 Lucky Streak, ☘ Clover cookie
function modProbs(boss, kind) {
  const luck = modLuck(boss), out = {};
  let left = 1;
  for (const m of MODIFIERS) if (m.kind === kind) { const q = Math.min(1, luck / m.oneIn); out[m.id] = left * q; left *= 1 - q; }
  out.none = left;
  return out;
}
function fmtOdds(p) {
  if (!p) return '—';
  // plain decimals, never scientific notation: keep 2 significant digits (0.2%, 0.0015%, 0.00000044%)
  const pct = p * 100, pctS = pct >= 1 ? pct.toFixed(1) : pct.toFixed(Math.min(20, Math.ceil(-Math.log10(pct)) + 1));
  return p >= 0.5 ? `${pctS}%` : `1 in ${fmt(Math.round(1 / p))} <span class="dim">(${pctS}%)</span>`;
}
const MOD_BY_ID = Object.fromEntries(MODIFIERS.map(m => [m.id, m]));
// an item's modifiers, power first (older saves stored a flavour modifier in `mod`)
const modsOf = it => [it.mod, it.flavour].map(id => id && MOD_BY_ID[id]).filter(Boolean).sort((a, b) => (a.kind === 'power' ? 0 : 1) - (b.kind === 'power' ? 0 : 1));
const modOf = it => modsOf(it)[0] || null;
// item name as HTML: rarity colour, plus the leading modifier's shimmer/rainbow effect
function nameHtml(it) {
  const ms = modsOf(it), R = RARITY[it.r], c = R.color;
  // the ultra-rare tiers shimmer on their own (Infinite/Absolute in rainbow); a Prismatic modifier still wins
  const fx = ms.some(m => m.fx === 'rainbow') || R.rainbow ? 'rainbow' : ms.length || R.shine ? 'shine' : '';
  const prefix = ms.length ? `${ms.map(x => x.icon).join('')} ${ms.map(x => x.name).join(' ')} ` : '';
  if (!fx) return `<span style="color:${c}">${it.name}</span>`;
  return `<span class="mod ${fx}" style="--c:${c};--m:${(ms[0] && ms[0].color) || '#fff'}">${prefix}${it.name}</span>`;
}
const sellValue = it => Math.round(4 * Math.pow(GOLD_FLOOR_GROWTH, it.ilvl - 1) * Math.pow(1 + it.r, 2) * (1 + 0.1 * baseLv('prospector')));  // ⛏ Prospector
const itemTag = nameHtml;
// worth shouting about even when sold: very rare modifiers, or a power + flavour double
const notableMods = it => { const ms = modsOf(it); return ms.length === 2 || ms.some(m => m.oneIn >= 1000); };
// 🏆 anything this rare (odds at drop time), or Ascended and above, goes in the catalogue
const FIND_ODDS = 1e-5, FIND_MAX = 300;
// a new item must be meaningfully stronger overall to replace gear (no micro-swaps): the old 3% threshold,
// on the compressed combat scale
const EQUIP_MIN_GAIN = cs(1.03) - 1;
function catalog(it, silent) {
  if (!(itemOdds(it) <= FIND_ODDS || it.r >= 10)) return;
  if (G.finds.some(f => f.id === it.id)) return;
  G.finds.push(Object.assign(JSON.parse(JSON.stringify(it)), { odds: itemOdds(it), foundAt: Date.now(), foundFloor: silent ? it.ilvl : G.floor, run: G.rebirths + 1 }));
  G.finds.sort((a, b) => a.odds - b.odds);
  if (G.finds.length > FIND_MAX) G.finds.length = FIND_MAX;  // keep the rarest
  if (!silent) { toast(`🏆 Rare find catalogued: ${nameHtml(it)} (${fmtOdds(itemOdds(it)).replace(/<[^>]+>/g, '')})`, '#ffcf40'); sfx('rare'); }
}
function gainItem(it) {
  G.stats.items++;
  if (!it.forged) catalog(it);  // (🔱 ascended items were made, not found)
  // for achievements, the recap and the Stats panel
  G.stats.bestR = Math.max(G.stats.bestR || 0, it.r);
  if (it.r >= 3) bump('epics');
  const ms = modsOf(it);
  if (ms.some(m => m.kind === 'power' && m.oneIn >= 1000)) G.stats.glow = 1;
  if (ms.length === 2) G.stats.double = 1;
  if (ms.some(m => m.id === 'prismatic')) G.stats.prism = 1;
  for (const m of ms) bump('modSeen', m.id);
  if (!it.forged && (!G.stats.bestItem || itemOdds(it) < G.stats.bestItem.odds)) G.stats.bestItem = Object.assign(JSON.parse(JSON.stringify(it)), { odds: itemOdds(it), foundFloor: G.floor, foundAt: Date.now() });
  if (!it.forged && (!recap.best || itemOdds(it) < itemOdds(recap.best))) recap.best = it;
  const gear = G.hero.gear, cur = rating(heroStats());
  const gain = rating(computeStats(Object.assign({}, gear, { [it.slot]: it }))) / cur - 1;
  if (gain > EQUIP_MIN_GAIN && canWear(it)) {
    const old = gear[it.slot];
    const before = heroStats().hp;
    gear[it.slot] = it; statCache = null; G.stats.equipped++;
    if (RT && !RT.hero.dead) RT.hero.hp = RT.hero.hp / before * heroStats().hp;
    // the replaced item: into the 🎒 stash if it's a kind you keep, otherwise sold
    const kept = old && stashIt(old), v = old && !kept ? sellValue(old) : 0;
    if (old && !kept) { G.gold += v; salvage(old); }
    addLog(`Equipped ${itemTag(it)} <span class="up">+${(gain * 100).toFixed(0)}%</span>${old ? (kept ? ' · old one went to the stash' : ` · sold old for ${fmt(v)}g`) : ''}`);
    const m = modOf(it);
    if (it.r >= G.settings.nEqR || (m && G.settings.nEqMod)) { toast(`${m ? '' : rarityIcon(it.r) + ' '}Equipped ${RARITY[it.r].name}: ${nameHtml(it)}${it.set ? ` <span style="color:${GEAR_SETS[it.set].color}">[${GEAR_SETS[it.set].name} set]</span>` : ''}`, m ? (m.sparkle || m.color) : RARITY[it.r].color); if (it.r >= 5 || notableMods(it)) sfx('rare'); }
    else if (!headless) floater(heroX(), VIEW.ground - 17 * VIEW.s, `▲ ${SLOTS[it.slot].icon} ${RARITY[it.r].name} +${(gain * 100).toFixed(0)}%`, RARITY[it.r].color, true);
  } else if (stashIt(it, it.forged || it.chest)) {  // (🔱 ascended and 📦 chest items are always kept)
    addLog(`🎒 Kept ${itemTag(it)} in the stash`);
  } else {
    const v = sellValue(it); G.gold += v; salvage(it);
    addLog(`Sold ${itemTag(it)} for ${fmt(v)}g`);
    const m = modOf(it);
    if (it.r >= G.settings.nSoldR || (notableMods(it) && G.settings.nSoldMod)) toast(`${m ? '' : rarityIcon(it.r) + ' '}Found ${RARITY[it.r].name}: ${nameHtml(it)} (sold, your gear is better)`, m ? (m.sparkle || m.color) : RARITY[it.r].color);
  }
  if (modOf(it)) G.stats.mods = (G.stats.mods || 0) + 1;
  ui.dirty = true;
}
const rarityIcon = r => r >= 14 ? '👁' : r >= 10 ? '🔱' : r >= 8 ? '🌌' : r >= 6 ? '💫' : r >= 4 ? '🌟' : '✨';

// ---------------- rebirth ----------------
const perkCost = k => {
  const P = PERKS[k], n = G.perks[k];
  return Math.ceil(P.base * Math.pow(P.growth, n) * (P.steepFrom != null && n >= P.steepFrom ? Math.pow(P.steep, n - P.steepFrom + 1) : 1));
};
// perk buy mode ×1 / ×10 / Max (settings.perkBuyMode, like the upgrades' buy mode): how many levels one click buys
function perkBulk(k) {
  const P = PERKS[k], mode = G.settings.perkBuyMode || 1, cap = P.max ? perkMax(k) : Infinity, l0 = G.perks[k];
  let n = 0, cost = 0;
  while (G.perks[k] < cap && (mode === 'max' ? cost + perkCost(k) <= G.souls : n < mode) && n < 1000) { cost += perkCost(k); G.perks[k]++; n++; }
  if (mode === 'max' && !n && G.perks[k] < cap) { n = 1; cost = perkCost(k); }  // show the next level's price when nothing is affordable
  G.perks[k] = l0;
  return { n, cost };
}
function buyPerkBulk(k) {
  const { n, cost } = perkBulk(k); if (!n || G.souls < cost) return;
  for (let i = 0; i < n; i++) { const before = G.perks[k]; buyPerk(k); if (G.perks[k] === before) break; }
}
function buyPerk(k) {
  const P = PERKS[k]; if (P.max && G.perks[k] >= perkMax(k)) return;
  const c = perkCost(k); if (G.souls < c) return;
  G.souls -= c; G.perks[k]++; bump('perkBought'); dirtyStats();
}
function rebirth(auto) {
  const gain = soulsFor(G.maxFloor); if (!gain || G.challenge || (RT && RT.rush)) return;
  const from = G.maxFloor;
  G.history.unshift({ n: G.rebirths + 1, floor: from, secs: Math.max(0, G.stats.time - (G.runStart || 0)), souls: gain, lvl: G.hero.lvl, at: Date.now() });
  if (G.history.length > 50) G.history.length = 50;
  G.runStart = G.stats.time; paceSamples.length = 0;
  G.souls += gain; G.rebirths++;
  G.stats.soulsEarned = (G.stats.soulsEarned || 0) + gain; G.stats.bestRebirth = Math.max(G.stats.bestRebirth || 0, gain);
  G.floor = 1; G.maxFloor = G.floor; G.chestsBought = 0; G.chestRun = {}; G.farm = false; G.farmT = 0; G.stuckT = 0; G.bossClears = {};
  for (const s in G.forge) G.forge[s] = 0;  // ⚒ reinforcement resets too
  // the measured income resets too: chests, cookies and the gem gold rush pay "minutes of income", which still held the
  // old run's deep-floor income for a minute or two (one chest after an Awakening paid ~76Qa)
  G.rates = { gold: 0, xp: 0, kills: 0 };
  G.hero.lvl = 1; G.hero.xp = 0; G.gold = 0;
  // ⏩ Head Start keeps a share of every upgrade's levels
  const keep = HEADSTART_PER / 100 * (G.perks.headstart || 0);
  for (const k in G.upg) G.upg[k] = Math.floor(G.upg[k] * keep);
  dirtyStats(); initRun();
  const hs = headStart();
  toast(`✦ ${auto ? 'Auto-rebirth' : 'Reborn'}! +${fmt(gain)} souls${hs ? ` · Head Start to floor ${hs.floor}` : ''}`, '#b388ff');
  addLog(`Rebirth #${G.rebirths} at floor ${from}: +${fmt(gain)} souls`);
  if (hs) addLog(`⏩ Head Start: began on floor ${hs.floor} with +${fmt(hs.gold)} gold and +${fmt(hs.xp)} XP`);
  ui.confirm = null;
}
// ⏩ Head Start: the floor a new run begins on
const headStartFloor = () => Math.max(1, Math.floor(G.bestFloor * HEADSTART_PER / 100 * (G.perks.headstart || 0)));
// start the run deeper, paying out the skipped floors' gold & XP (at the replay bonus, like a Blitz through them)
function headStart() {
  const to = headStartFloor(); if (to <= 1) return null;
  const st = heroStats(); let gold = 0, xp = 0;
  for (let f = 1; f < to; f++) { const b = floorBase(f), n = waveSize(f), boss = isBossFloor(f); gold += b.gold * (n + (boss ? 15 : 0)); xp += b.xp * (n + (boss ? 10 : 0)); }
  gold *= st.goldMult * REPLAY_BONUS; xp *= st.xpMult * REPLAY_BONUS;
  G.floor = G.maxFloor = to; G.gold += gold; G.stats.gold += gold;
  gainXp(xp);
  return { floor: to, gold, xp };
}

// ---------------- log / toast ----------------
function addLog(html) {
  if (headless || simFast) return;
  G.log.unshift({ t: Date.now(), html }); if (G.log.length > 30) G.log.length = 30;
  const tk = $('#ticker'); if (tk) { tk.innerHTML = html; tk.classList.remove('flash'); void tk.offsetWidth; tk.classList.add('flash'); }
}
// popup kinds that can be switched off in Settings (the log still records them)
const TOAST_CATS = { ach: '🏅 Achievements', boss: '☠ Bosses', skill: '🌀 Skills learned', unlock: '⬆ New unlocks', amulet: '📿 Amulets', gem: '💎 Gems', pet: '🐾 Pets',
  bestiary: '📖 Bestiary', bounty: '📅 Bounties', zone: '🌍 Zone rules', cookie: '🍪 Cookies', chest: '🎁 Chests' };
function toast(text, color, cat) {
  if (headless || simFast) return;
  if (cat && G && G.settings.mute && G.settings.mute[cat]) return;
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast'; el.style.borderColor = color || '#7df9ff'; el.innerHTML = text;
  box.prepend(el); while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
}

// ---------------- 🔊 sound: tiny synthesized chimes (off by default) ----------------
let audioCtx = null, lastSfx = 0;
const SFX = {
  rare: [[660, 0], [880, 0.08], [1320, 0.16]], boss: [[220, 0], [330, 0.1], [440, 0.2]], ach: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]],
  gem: [[1568, 0], [2093, 0.07]], pet: [[784, 0], [988, 0.08], [784, 0.16]], bounty: [[587, 0], [880, 0.12]],
};
function sfx(kind) {
  if (headless || simFast || !G || !G.settings.sound || !SFX[kind]) return;
  const now = performance.now(); if (now - lastSfx < 120) return; lastSfx = now;  // no pile-ups during Blitz
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime, vol = 0.08 * (G.settings.volume ?? 0.5);
    for (const [f, dt] of SFX[kind]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(vol, t0 + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.35);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.4);
    }
  } catch (e) { }
}

// ---------------- save / load / offline ----------------
const Bridge = {
  api: null,
  async init() {
    if (window.pywebview && window.pywebview.api) { this.api = window.pywebview.api; return; }
    await new Promise(res => { window.addEventListener('pywebviewready', () => { this.api = window.pywebview.api; res(); }, { once: true }); setTimeout(res, 1500); });
  },
  async load() { if (this.api) { try { return await this.api.load(); } catch (e) { return null; } } try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } },
  save(str) { if (this.api) { this.api.save(str); return; } try { localStorage.setItem(SAVE_KEY, str); } catch (e) { } },
  call(fn, ...a) { if (this.api && this.api[fn]) return this.api[fn](...a); },
};
let resetting = false;
// during a 🏁 challenge the file holds your normal save with the challenge's game inside it (chalRun)
const saveData = () => JSON.stringify(MAIN ? Object.assign({}, MAIN, { chalRun: G, lastSave: Date.now() }) : G);
function save() { if (!G || resetting) return; G.lastSave = Date.now(); Bridge.save(saveData()); }
function applyLoaded(raw) {
  G = newGame(); MAIN = null;
  if (!raw) return false;
  let d;
  try { d = JSON.parse(raw); } catch (e) { console.error(e); return false; }
  for (const k in d) {
    if (['heroes', 'bag'].includes(k)) continue;  // from the party version
    if (G[k] && typeof G[k] === 'object' && !Array.isArray(G[k]) && d[k] && typeof d[k] === 'object') Object.assign(G[k], d[k]);
    else G[k] = d[k];
  }
  // migrate the party version: keep the warrior, run the old bag through auto-equip/sell
  if (d.heroes && d.heroes.warrior) {
    const w = d.heroes.warrior;
    G.hero = { lvl: w.lvl, xp: w.xp, gear: Object.assign(Object.fromEntries(Object.keys(SLOTS).map(k => [k, null])), w.gear) };
    headless = true;
    for (const c of ['ranger', 'mage', 'cleric']) if (d.heroes[c] && d.heroes[c].unlocked) for (const s in d.heroes[c].gear) if (d.heroes[c].gear[s]) gainItem(d.heroes[c].gear[s]);
    (d.bag || []).forEach(gainItem);
    headless = false;
  }
  // removed perks: refund the souls spent on them
  for (const [k, P] of Object.entries(REMOVED_PERKS)) for (let i = 0; i < (G.perks[k] || 0); i++) G.souls += Math.ceil(P.base * Math.pow(P.growth, i));
  for (const k of Object.keys(G.perks)) if (!(k in PERKS)) delete G.perks[k];
  for (const k of Object.keys(G.skills)) if (!(k in SKILLS)) delete G.skills[k];
  for (const s in SLOTS) { if (!(s in G.hero.gear)) G.hero.gear[s] = null; if (!G.forge[s]) G.forge[s] = 0; }  // new gear slots
  delete G.rallyT; delete G.rallyCd;
  // rarity/modifiers switched from flat multipliers to "floors of depth": rescale gear saved before that
  if (!d.itemScale) {
    const byId = Object.fromEntries(MODIFIERS.map(m => [m.id, m]));
    for (const it of Object.values(G.hero.gear)) {
      if (!it || !RARITY[it.r]) continue;
      let k = RARITY[it.r].mult3 / RARITY[it.r].oldMult;
      for (const id of [it.mod, it.flavour]) if (id && byId[id]) k *= byId[id].mult3 / byId[id].oldMult;
      if (it.atk) it.atk = Math.round(it.atk * k);
      if (it.hp) it.hp = Math.round(it.hp * k);
    }
  }
  // item stats per floor went 1.13 → 1.08: rescale saved gear (and catalogued finds) to the new curve
  if ((d.itemScale || 1) < 3) {
    const k = it => Math.pow(ITEM_FLOOR_GROWTH3 / OLD_ITEM_FLOOR_GROWTH, (it.ilvl || 1) - 1);
    for (const it of [...Object.values(G.hero.gear), ...(G.finds || [])]) {
      if (!it) continue;
      if (it.atk) it.atk = Math.max(1, Math.round(it.atk * k(it)));
      if (it.hp) it.hp = Math.max(1, Math.round(it.hp * k(it)));
    }
  }
  // combat numbers compressed (COMBAT_SCALE): an item's depth/rarity/modifier growth g becomes g^scale.
  // Scale each saved item by g^(new scale - old scale), which keeps its random roll.
  // v4 went uncompressed → 0.3, v5 went 0.3 → 0.2
  const rescale = (from, to) => {
    const byId = Object.fromEntries(MODIFIERS.map(m => [m.id, m]));
    for (const it of [...Object.values(G.hero.gear), ...(G.finds || []), G.stats.bestItem]) {
      if (!it || !RARITY[it.r]) continue;
      let g = Math.pow(ITEM_FLOOR_GROWTH3, (it.ilvl || 1) - 1) * RARITY[it.r].mult3;
      for (const id of [it.mod, it.flavour]) if (id && byId[id]) g *= byId[id].mult3;
      const k = Math.pow(g, to - from);
      if (it.atk) it.atk = Math.max(1, Math.round(it.atk * k));
      if (it.hp) it.hp = Math.max(1, Math.round(it.hp * k));
    }
    G.buffs = G.buffs.filter(bf => !bf.mult.atk);  // old-size damage cookies
  };
  if ((d.itemScale || 1) < 4) rescale(1, COMBAT_SCALE_V4);
  if ((d.itemScale || 1) < 5) rescale(COMBAT_SCALE_V4, COMBAT_SCALE);
  G.itemScale = COMBAT_VERSION;
  // Ascended+ got stronger: bring saved jackpot items (worn and catalogued) up to the new values
  if ((d.rarityV || 1) < 2) {
    // (indexes here are from before Ethereal was inserted: this runs before the shift below)
    for (const it of [...Object.values(G.hero.gear), ...(G.finds || [])]) {
      if (!it || !(it.r in OLD_ULTRA_POWER)) continue;
      const nr = it.r + 1, k = cs(Math.pow(OLD_ITEM_FLOOR_GROWTH, RARITY_POWER[nr] - OLD_ULTRA_POWER[it.r])), ak = affixMult(nr) / (1 + it.r * 0.35);
      if (it.atk) it.atk = Math.round(it.atk * k);
      if (it.hp) it.hp = Math.round(it.hp * k);
      for (const s in it.aff) it.aff[s] = Math.round(it.aff[s] * ak * 10) / 10;
    }
  }
  // v3: Ethereal was inserted at index 10, so everything that was Ascended or rarer moves up one index
  if ((d.rarityV || 1) < 3) {
    const bumpR = it => { if (it && it.r >= ETHEREAL_INDEX) it.r++; };
    [...Object.values(G.hero.gear), ...(G.finds || []), ...(G.stash || []), G.stats.bestItem].forEach(bumpR);
    if ((G.stats.bestR || 0) >= ETHEREAL_INDEX) G.stats.bestR++;
    if (G.settings.keepR) { const k = {}; for (const [r, v] of Object.entries(G.settings.keepR)) k[+r >= ETHEREAL_INDEX ? +r + 1 : r] = v; G.settings.keepR = k; }
    for (const s of ['nEqR', 'nSoldR']) if (G.settings[s] >= ETHEREAL_INDEX && G.settings[s] !== 99) G.settings[s]++;
    for (let r = RARITY.length - 2; r >= ETHEREAL_INDEX; r--) if (G.ach['rar' + r]) { G.ach['rar' + (r + 1)] = G.ach['rar' + r]; delete G.ach['rar' + r]; }
  }
  G.rarityV = RARITY_VERSION;
  // economy v2: gold & XP curves were shrunk. Rescale banked gold so it covers the same share of the
  // next Sharpen level as before (and XP the same share of the next hero level)
  if ((d.econ || 1) < 2) {
    const L = G.upg.damage || 0, gk = Math.pow(UPGRADES.damage.growth / 1.62, L);
    G.gold *= gk; G.rates.gold *= gk; G.stats.gold *= gk;
    const xk = Math.pow(XP_LEVEL_GROWTH / 1.14, G.hero.lvl - 1);
    G.hero.xp *= xk; G.rates.xp *= xk;
    G.log = G.log.filter(l => !/ for [\d.]+e\d+g/.test(l.html));  // sale prices from the old scale
  }
  G.econ = ECON_VERSION;
  // saves from before the catalogue: record any qualifying gear you're already wearing
  if (!d.finds) for (const it of Object.values(G.hero.gear)) if (it) catalog(it, true);
  // the removed Horde upgrade: refund what was spent on it this run
  if (G.upg.horde) { for (let i = 0; i < G.upg.horde; i++) G.gold += Math.ceil(400 * Math.pow(2.6, i)); }
  // upgrades removed in the skills rework: refund this run's spending
  for (const [k, U] of Object.entries(REMOVED_UPGRADES)) for (let i = 0; i < (G.upg[k] || 0); i++) G.gold += Math.ceil(U.base * Math.pow(U.growth, i));
  // gear stats removed in the skills rework
  for (const it of [...Object.values(G.hero.gear), ...(G.finds || [])]) if (it && it.aff) for (const k of REMOVED_AFFIXES) delete it.aff[k];
  for (const k of Object.keys(G.upg)) if (!(k in UPGRADES)) delete G.upg[k];  // removed / old upgrade names
  // Bountiful went from +1 item per level to a 20% chance per level: refund every soul spent on it
  if ((d.bountyV || 1) < BOUNTY_VERSION && G.perks.bounty) {
    const P = OLD_BOUNTY; let refund = 0;
    for (let n = 0; n < G.perks.bounty; n++) refund += Math.ceil(P.base * Math.pow(P.growth, n) * (n >= P.steepFrom ? Math.pow(P.steep, n - P.steepFrom + 1) : 1));
    G.souls += refund; G.perks.bounty = 0;
    G.pendingNote = `✦ Bountiful was reworked: your ${fmt(refund)} souls spent on it were refunded`;
  }
  G.bountyV = BOUNTY_VERSION;
  // stats the achievements need, for saves from before they existed
  G.stats.maxLvl = Math.max(G.stats.maxLvl || 1, G.hero.lvl);
  for (const it of [...Object.values(G.hero.gear), ...(G.finds || [])]) if (it) G.stats.bestR = Math.max(G.stats.bestR || 0, it.r);
  if (G.stats.chests == null) G.stats.chests = 0;
  // souls from past rebirths, for saves from before that was counted
  // bosses already beaten, per zone (saves from before this was counted): every zone boss floor below the best
  if (!G.stats.bossZ) { G.stats.bossZ = {}; for (let f = 10; f < G.bestFloor; f += 10) G.stats.bossZ[ZONES.indexOf(zoneOf(f))] = 1; }
  if (G.stats.maxLap == null) G.stats.maxLap = zoneTier(G.bestFloor);
  // scrap got much scarcer (v2): shrink banked scrap by about as much
  // (only saves from before scrap v2 had scrap; a save with no scrap at all has nothing to shrink)
  if ((d.scrapV || 1) < SCRAP.version && G.scrap && (d.stats || {}).scrap > 0 && !(d.bestFloor < 120)) { const old = G.scrap; G.scrap = Math.floor(G.scrap / 25); G.pendingNote = `🔩 Scrap was rebalanced (much rarer now): your ${fmt(old)} scrap became ${fmt(G.scrap)}`; }
  G.scrapV = SCRAP.version;  // laps already started (no catch-up popups)
  // zones got a second boss (Guardian at x10, Lord at x20): count the ones already passed
  if (!G.stats.bossL) {
    G.stats.bossL = {}; G.stats.bossG = G.stats.bossG || {};
    for (let f = 10; f < G.bestFloor; f += 10) G.stats[bossKind(f) === 'guard' ? 'bossG' : 'bossL'][ZONES.indexOf(zoneOf(f))] = 1;
  }
  if (G.stats.soulsEarned == null) { G.stats.soulsEarned = (G.history || []).reduce((a, h) => a + (h.souls || 0), 0); G.stats.bestRebirth = Math.max(0, ...(G.history || []).map(h => h.souls || 0)); }
  for (const k of Object.keys(G.skills)) G.skills[k] = { on: G.skills[k].on !== false };
  statCache = null;
  // older saves: don't announce everything that's already unlocked; award achievements already earned quietly
  if (!d.seen) markSeen();
  if (!d.ach) { const n = checkAchievements(true); if (n) G.pendingAch = n; }
  // 💎 gems arrived (or were rebalanced): pay out the bosses and achievements this save already has.
  // A rebalance undoes gem purchases, since the old prices were far lower
  if (d.gems == null || (d.gemsV || 1) < GEMS.version) {
    let g = 0, f = 10;
    for (; f < G.bestFloor; f += 10) g += gemsForBoss(f);
    G.gemFloor = f - 10; g += achCount() * GEMS.perAch;
    const had = d.gems != null;
    G.gems = g; G.stats.gemsEarned = g; G.skillRank = {}; G.relics = {}; G.amulet2 = null;
    if (g) G.pendingNote2 = had ? `💎 Gems were rebalanced (rarer, pricier). Your gems were recalculated to ${g} and gem purchases undone so you can re-buy at the new prices.`
      : `💎 Gems are here! You got ${g} for the bosses and achievements you've already done. Spend them in 🛡 Hero → 💎`;
  }
  G.gemsV = GEMS.version;
  // 🔱 Forge ascension was removed (replaced by 🌠 Fate): drop its achievements and setting; ascended items stay
  for (const id of ['ascend1', 'ascendJack']) delete G.ach[id];
  delete G.settings.ascSkipUp; delete G.settings.autoReforge;  // (auto-reforge toggles aren't saved any more) if (G.settings.tabs && G.settings.tabs.forge === 'ascend') delete G.settings.tabs.forge;
  // 🧪 Insight arrived: pay out the boss floors already beaten, like Stardust did
  if (!d.insightV) {
    let n = 0; for (let f = FLOORS_PER_ZONE / 2; f < G.bestFloor; f += FLOORS_PER_ZONE / 2) n += 1 + zoneTier(f);
    G.insight = n; G.insightV = 1;
    if (n && G.bestFloor >= LAB.at) G.pendingNote4 = `🧪 The Laboratory is here! You got ${fmt(n)} Insight for the boss floors you've already beaten. Research in 🏁 → 🧪 Lab`;
  }
  // ⚒ reinforcement now resets on rebirth: start the lifetime count (for the Smith achievements) from today's levels
  G.stats.reinforces = Math.max(G.stats.reinforces || 0, Object.values(G.forge || {}).reduce((a, b) => a + b, 0));
  // ✧ Constellations arrived: pay out the Stardust of every floor already beaten (like gems did)
  if (!d.starV) {
    let dust = 0; for (let f = 1; f < G.bestFloor; f++) dust += starFor(f);
    G.stardust = dust; G.stats.dustEarned = dust; G.starFloor = G.bestFloor - 1; G.starV = 1;
    if (dust) G.pendingNote3 = `✧ Constellations are here! You got ${fmt(dust)} Stardust for the floors you've already beaten past lap 1. Spend it in ✦ Rebirth → ✧ Stars`;
  }
  // 🌅 Essence v2 (souls counted without Essence's own soul bonus): recalculate banked Essence as what your lifetime souls
  // would give under the new rule (never raised). The old loop had pushed it to ~800K by lap 5
  if ((d.essV || 1) < AWAKEN.version && G.essence > 0) {
    const old = G.essence, fresh = Math.floor(Math.pow((G.stats.soulsEarned || 0) / essSouls() / AWAKEN.per, AWAKEN.exp) * starMult('essence'));
    if (fresh < old) { G.essence = Math.max(1, fresh); G.pendingNote5 = `🌅 Awakening was rebalanced (Essence no longer feeds itself through its soul bonus): your Essence was recalculated from ${fmt(old)} to ${fmt(G.essence)}`; }
  }
  G.essV = AWAKEN.version;
  // ⬆ saves (and challenge runs in progress) where auto-buy was already unlocked keep their auto-buy setup as it is
  if (featureOn('autoUpg')) G.autoUpgInit = true;
  // 🌅 the lap wake-up now plays once per save: saves that already started a second lap have seen it
  if ((G.stats.maxLap || 0) >= 1) G.seen.wake = 1;
  // 🏁 a challenge run in progress: load it too (with the same migrations) and park the normal save
  const run = G.chalRun; delete G.chalRun;
  if (run && run.challenge && CHALLENGES[run.challenge.id]) { const main = G; applyLoaded(JSON.stringify(run)); MAIN = main; }
  return true;
}
function offline(sec, eff) {
  const gold = G.rates.gold * sec * eff, xp = G.rates.xp * sec * eff, kills = G.rates.kills * sec * eff;
  const all = Math.floor(kills * dropChance(G.floor) * itemsPerDropAvg(false)), nItems = Math.min(40, all);
  // 🌠 only 40 items are actually rolled; the rest still count toward Fate (the next real drop can then be fated)
  if (all > nItems) for (const t in FATE) G.fate[t] = Math.min(FATE[t] - 1, (G.fate[t] || 0) + (all - nItems) * starMult('fate') * labMult('fate'));
  G.gold += gold; G.stats.gold += gold; G.stats.kills += Math.floor(kills);
  const lv0 = G.hero.lvl, eq0 = G.stats.equipped;
  gainXp(xp);
  const prev = recap.best; recap.best = null;
  for (let i = 0; i < nItems; i++) gainItem(makeItem(G.floor, false));
  const best = recap.best;
  recap.best = prev && (!best || itemOdds(prev) < itemOdds(best)) ? prev : best;
  return { gold, xp, items: nItems, equipped: G.stats.equipped - eq0, lvUps: G.hero.lvl - lv0, best };
}

// ============================================================
//  Rendering
// ============================================================
let cv, ctx;
const sprCache = new Map();
function spriteCanvas(name, pal, flip, white) {
  const key = name + JSON.stringify(pal || {}) + flip + white;
  let c = sprCache.get(key); if (c) return c;
  const S = SPRITES[name], P = Object.assign({}, S.pal, pal || {});
  c = document.createElement('canvas'); c.width = c.height = 12;
  const x = c.getContext('2d');
  S.rows.forEach((row, y) => { for (let i = 0; i < 12; i++) { const ch = row[i]; if (!ch || ch === '.') continue; x.fillStyle = white ? '#ffffff' : P[ch] || '#f0f'; x.fillRect(flip ? 11 - i : i, y, 1, 1); } });
  sprCache.set(key, c); return c;
}
// ---- 🎨 the hero with his wardrobe: a 12×15 canvas (3 spare rows on top for hats) ----
const cosmeticById = id => { for (const c in COSMETICS) if (COSMETICS[c].items[id]) return Object.assign({ cat: c }, COSMETICS[c].items[id]); return null; };
const cosOf = cat => COSMETICS[cat].items[(G.cos || {})[cat]] || {};
// defaults, anything its achievement unlocked, and pets found as boss drops / summoned with gems
const cosUnlocked = id => !!Object.keys(COSMETICS).find(c => Object.keys(COSMETICS[c].items)[0] === id) || ACHIEVEMENTS.some(A => A.cos === id && G.ach[A.id]) || !!(G.petsFound && G.petsFound[id]);
// 🐾 a boss sometimes brings a pet you don't have yet
function unlockRandomPet(source) {
  const left = Object.keys(COSMETICS.pet.items).slice(1).filter(id => !cosUnlocked(id));
  if (!left.length) return null;
  const id = pick(left), P = COSMETICS.pet.items[id];
  G.petsFound[id] = Date.now();
  const fx = Object.entries(P.fx || {}).map(([k, v]) => `+${v}${AFFIXES[k] ? AFFIXES[k].name : ' ' + k}`).join(', ');
  toast(`🐾 ${source}: <b>${P.name}</b>${fx ? ` <span class="dim">(${fx} when worn)</span>` : ''}. Wear it in 🎨 Wardrobe → Pet`, '#ffb3e6', 'pet'); sfx('pet');
  addLog(`🐾 New pet: ${P.name}${fx ? ` (${fx})` : ''}`);
  return id;
}
const HERO_TOP = 3;  // spare rows above the sprite
function heroCanvas(white, t = 0) {
  const W = cosOf('weapon'), hue = W.rainbow || cosOf('cape').rainbow ? Math.floor(t * 4) % 12 : 0;
  const key = 'hero' + JSON.stringify(G.cos) + white + hue;
  let c = sprCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = 12; c.height = 12 + HERO_TOP;
  const x = c.getContext('2d');
  const paint = (rows, y0, pal) => rows.forEach((row, y) => { for (let i = 0; i < 12; i++) { const ch = row[i]; if (!ch || ch === '.') continue; x.fillStyle = white ? '#ffffff' : pal[ch] || '#f0f'; x.fillRect(i, HERO_TOP + y0 + y, 1, 1); } });
  const cape = cosOf('cape'), helm = cosOf('helm'), S = SPRITES[HERO.sprite];
  if (cape.pal) paint(CAPE_ROWS, CAPE_Y, cape.rainbow ? { C: `hsl(${hue * 30 + 180},100%,60%)` } : cape.pal);
  const pal = Object.assign({}, S.pal, cosOf('dye').pal || {}, W.pal || {});
  if (W.rainbow) pal.W = `hsl(${hue * 30},100%,70%)`;
  paint(S.rows, 0, pal);
  if (helm.rows) paint(helm.rows, helm.y, helm.pal);
  if (sprCache.size > 400) sprCache.clear();
  sprCache.set(key, c); return c;
}
function drawHero(cx, bottom, scale, white) {
  const c = heroCanvas(white, RT ? RT.t : 0);
  ctx.drawImage(c, Math.round(cx - 6 * scale), Math.round(bottom - (12 + HERO_TOP) * scale), 12 * scale, (12 + HERO_TOP) * scale);
}
// aura sparkles, the pet, and the Spirit Companion
function drawHeroExtras(x, g, s, t) {
  const aura = cosOf('aura');
  if (aura.colors || aura.rainbow) for (let i = 0; i < 4; i++) {
    const p = t * 1.3 + i * 1.6, a = (Math.sin(p * 2.9) + 1) / 2;
    ctx.globalAlpha = 0.35 + a * 0.65;
    ctx.fillStyle = aura.rainbow ? `hsl(${(t * 90 + i * 90) % 360},100%,70%)` : aura.colors[i % aura.colors.length];
    ctx.fillRect(x + Math.sin(p) * 6 * s, g - 2 * s - ((t * 6 * s + i * 3.3 * s) % (12 * s)), Math.max(1, s / 2), Math.max(1, s / 2));
  }
  const cape = cosOf('cape');
  if (cape.glow) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4); ctx.fillStyle = cape.glow; ctx.fillRect(x - 6 * s + ((t * 3) % 2) * s, g - 5 * s + Math.sin(t * 3) * 2 * s, Math.max(1, s / 2), Math.max(1, s / 2)); }
  ctx.globalAlpha = 1;
  const pet = cosOf('pet');
  if (pet.sprite) {
    const ps = Math.max(1, Math.round(s * 0.6)), walk = RT.phase === 'walk';
    const py = pet.fly ? g - 8 * s + Math.sin(t * 4) * s : g - (walk ? Math.abs(Math.sin(t * 10)) * s : 0);
    drawSprite(pet.sprite, pet.pal, x - 10 * s, py, ps, false, false);
  }
  if (G.perks.companion) {
    const hit = RT.compHit > 0 ? 4 * s : 0;
    drawSprite('ghost', { W: '#b3e5fc', K: '#01579b' }, x + 2 * s + hit, g - 11 * s + Math.sin(t * 2.5) * s, Math.max(1, Math.round(s * 0.7)), false, false, 0.55);
  }
}
function drawSprite(name, pal, cx, bottom, scale, flip, white, alpha = 1) {
  const c = spriteCanvas(name, pal, flip, white), sz = 12 * scale;
  ctx.globalAlpha = alpha; ctx.drawImage(c, Math.round(cx - sz / 2), Math.round(bottom - sz), sz, sz); ctx.globalAlpha = 1;
}
function resize() {
  document.body.classList.toggle('tight', window.innerHeight < 260 && !document.body.classList.contains('fs'));
  document.body.classList.toggle('details', !!(G && G.settings.details));
  const st = $('#stage'); const w = st.clientWidth, h = st.clientHeight, dpr = window.devicePixelRatio || 1;
  if (!w || !h) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  const oldW = VIEW.w, oldS = VIEW.s;
  VIEW.w = w; VIEW.h = h; VIEW.s = clamp(Math.floor(h / 42), 2, 10); VIEW.ground = h - Math.max(10, 3 * VIEW.s);
  // keep things on screen in the same relative place when the window changes size
  if (RT && (oldW !== w || oldS !== VIEW.s)) {
    for (const e of RT.enemies) e.x *= w / oldW;
    if (RT.chest) RT.chest.x *= w / oldW;
    RT.proj = []; RT.floaters = []; RT.fx = [];
  }
}
function drawBg() {
  const z = curZone().bg, w = VIEW.w, h = VIEW.h, s = VIEW.s, g = VIEW.ground, t = RT.t;
  ctx.fillStyle = z.back; ctx.fillRect(0, 0, w, h);
  const bw = 10 * s, bh = 5 * s, off = (RT.scroll * 0.5) % bw;
  for (let row = 0; row * bh < g; row++) {
    const y = g - (row + 1) * bh, shift = (row % 2) * bw / 2;
    for (let x = -bw * 2; x < w + bw; x += bw) {
      ctx.fillStyle = ((Math.floor((x + shift) / bw) + row) % 3 === 0) ? z.wall2 : z.wall;
      ctx.fillRect(x - off + shift + 1, y + 1, bw - 2, bh - 2);
    }
  }
  const fade = ctx.createLinearGradient(0, 0, 0, g); fade.addColorStop(0, z.back); fade.addColorStop(0.55, z.back + '00');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, w, g);
  const sp = 36 * s, doff = (RT.scroll * 0.5) % sp;
  for (let x = -sp; x < w + sp; x += sp) {
    const dx = x - doff + sp / 2, k = Math.floor((x + RT.scroll * 0.5) / sp);
    if (z.deco === 'torch') {
      const y = g - 16 * s, fl = Math.sin(t * 13 + k) * 0.5 + 0.5;
      const gr = ctx.createRadialGradient(dx, y, 1, dx, y, 16 * s); gr.addColorStop(0, `rgba(255,160,60,${0.25 + fl * 0.1})`); gr.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(dx - 16 * s, y - 16 * s, 32 * s, 32 * s);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(dx - s / 2, y, s, 4 * s);
      ctx.fillStyle = '#ff9d3b'; ctx.fillRect(dx - s, y - 2 * s - fl * s, 2 * s, 2 * s + fl * s);
      ctx.fillStyle = '#ffe082'; ctx.fillRect(dx - s / 2, y - s - fl * s / 2, s, s);
    } else if (z.deco === 'shroom') {
      const hh = (2 + (k % 3)) * s, gl = 0.5 + Math.sin(t * 2 + k) * 0.2;
      ctx.fillStyle = '#c5b8a0'; ctx.fillRect(dx - s / 2, g - hh, s, hh);
      ctx.fillStyle = `rgba(80,230,210,${gl})`; ctx.fillRect(dx - 2 * s, g - hh - 2 * s, 4 * s, 2 * s);
    } else if (z.deco === 'lava') {
      ctx.fillStyle = `rgba(255,${100 + Math.sin(t * 3 + k) * 40},30,0.6)`; ctx.fillRect(dx - 3 * s, g - 1, 6 * s, 2);
      const ey = g - ((t * 20 * s + k * 37) % (g * 0.8));
      ctx.fillStyle = '#ffab40'; ctx.fillRect(dx + Math.sin(t + k) * 4 * s, ey, Math.max(1, s / 2), Math.max(1, s / 2));
    } else if (z.deco === 'ice') {
      ctx.fillStyle = '#b3e5fc';
      for (let i = 0; i < 3; i++) { const ih = (3 + ((k + i) % 4)) * s; ctx.fillRect(dx + i * 3 * s - 3 * s, 0, s, ih); ctx.fillRect(dx + i * 3 * s - 3 * s + s / 4, ih, s / 2, s); }
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(dx + ((t * 10 + k * 13) % sp) - sp / 2, (t * 15 * s + k * 29) % g, Math.max(1, s / 2), Math.max(1, s / 2));
    } else if (z.deco === 'bubbles') {
      // seaweed swaying on the floor, bubbles drifting up
      const sw = Math.sin(t * 1.5 + k) * s;
      ctx.fillStyle = '#2e7d5b'; for (let i = 0; i < 4; i++) ctx.fillRect(dx + sw * (i / 4), g - (i + 1) * 2 * s, s, 2 * s);
      ctx.fillStyle = 'rgba(180,240,255,0.5)';
      for (let i = 0; i < 2; i++) { const by = g - ((t * 12 * s + k * 41 + i * 57) % g); ctx.fillRect(dx + 6 * s + Math.sin(t * 2 + i + k) * 2 * s, by, Math.max(1, s * 0.75), Math.max(1, s * 0.75)); }
    } else if (z.deco === 'sand') {
      // sandstone pillars and drifting sand
      ctx.fillStyle = '#8d6e45'; ctx.fillRect(dx - 2 * s, g - 20 * s, 4 * s, 20 * s);
      ctx.fillStyle = '#a5845a'; ctx.fillRect(dx - 3 * s, g - 21 * s, 6 * s, 2 * s); ctx.fillRect(dx - 3 * s, g - 2 * s, 6 * s, 2 * s);
      ctx.fillStyle = 'rgba(230,200,140,0.6)';
      for (let i = 0; i < 3; i++) ctx.fillRect(((t * 40 * s + k * 53 + i * 97) % (w + 20)) - 10, g - ((k * 13 + i * 29) % (g * 0.8)), Math.max(1, s / 2), Math.max(1, s / 2));
    } else if (z.deco === 'crystal') {
      // glowing crystal clusters
      const gl = 0.55 + Math.sin(t * 2 + k) * 0.25, hues = ['#b388ff', '#80deea', '#ff80ab'];
      for (let i = 0; i < 3; i++) {
        const ch = (3 + ((k + i * 2) % 4)) * s;
        ctx.globalAlpha = gl; ctx.fillStyle = hues[(((k + i) % 3) + 3) % 3];
        ctx.fillRect(dx + (i - 1) * 2 * s, g - Math.abs(ch), 1.5 * s, Math.abs(ch));
      }
      ctx.globalAlpha = 1;
    } else if (z.deco === 'vines') {
      // vines hanging from above, leaves drifting down
      const vl = (6 + ((k % 4) + 4) % 4 * 3) * s, sw = Math.sin(t * 1.2 + k) * s;
      ctx.fillStyle = '#3f7a2a'; for (let y = 0; y < vl; y += s) ctx.fillRect(dx + sw * (y / vl), y, s, s);
      ctx.fillStyle = '#66bb6a'; ctx.fillRect(dx + sw - s, vl, 3 * s, s);
      ctx.fillStyle = 'rgba(139,195,74,0.7)';
      ctx.fillRect(dx + 8 * s + Math.sin(t + k) * 3 * s, (t * 8 * s + k * 37) % g, s, Math.max(1, s / 2));
    } else if (z.deco === 'storm') {
      // drifting clouds, the odd lightning flash, slanting rain
      ctx.fillStyle = 'rgba(40,46,60,0.8)';
      ctx.fillRect(dx - 8 * s, 2 * s + (k % 3 + 3) % 3 * s, 16 * s, 3 * s); ctx.fillRect(dx - 5 * s, 1 * s, 10 * s, 2 * s);
      ctx.fillStyle = 'rgba(170,190,220,0.45)';
      for (let i = 0; i < 3; i++) { const ry = (t * 60 * s + k * 31 + i * 47) % g; ctx.fillRect(dx + i * 9 * s - ry * 0.3, ry, Math.max(1, s / 2), 2 * s); }
      if (x === -sp && Math.sin(t * 0.7) > 0.985) { ctx.fillStyle = 'rgba(255,255,230,0.12)'; ctx.fillRect(0, 0, w, g); }
    } else if (z.deco === 'gears') {
      // turning brass gears on the wall
      const gy = g - 14 * s, r = (2 + ((k % 2) + 2) % 2) * s, rot = t * (k % 2 ? 1 : -1) * 1.5;
      ctx.fillStyle = '#8d6e3f'; ctx.beginPath(); ctx.arc(dx, gy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b08d57';
      for (let i = 0; i < 6; i++) { const an = rot + i * Math.PI / 3; ctx.fillRect(dx + Math.cos(an) * (r + s / 2) - s / 2, gy + Math.sin(an) * (r + s / 2) - s / 2, s, s); }
      ctx.fillStyle = '#3d301d'; ctx.fillRect(dx - s / 2, gy - s / 2, s, s);
    } else if (z.deco === 'stars') {
      for (let i = 0; i < 4; i++) { const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + k * 3 + i)); ctx.fillStyle = `rgba(200,160,255,${tw})`; ctx.fillRect(dx + ((k * 17 + i * 23) % sp) - sp / 2, ((k * 31 + i * 47) % (g * 0.7)), Math.max(1, s / 2), Math.max(1, s / 2)); }
    }
  }
  ctx.fillStyle = z.floor; ctx.fillRect(0, g, w, h - g);
  ctx.fillStyle = z.floor2; const tw = 8 * s, toff = RT.scroll % tw;
  for (let x = -tw; x < w + tw; x += tw) ctx.fillRect(x - toff, g, 1, h - g);
  ctx.fillRect(0, g, w, Math.max(1, s / 2));
}
// 🌅 "waking up" after a lap: black, then eyelids open, blink once, open fully, then the lap popup
const WAKE_SECS = 3;
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
function drawWake() {
  const W = ui.wake, p = (performance.now() - W.t0) / 1000 / WAKE_SECS, w = VIEW.w, h = VIEW.h;
  if (p >= 1) { ui.wake = null; showLapModal(W.lap); return; }
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  // how far the eyes are open: a first peek, a blink, then all the way
  const open = p < 0.15 ? 0 : p < 0.4 ? ease((p - 0.15) / 0.25) * 0.45 : p < 0.5 ? 0.45 - ease((p - 0.4) / 0.1) * 0.35 : 0.1 + ease((p - 0.5) / 0.45) * 0.9;
  ctx.save();
  ctx.fillStyle = `rgba(255,240,220,${(1 - open) * 0.25})`; ctx.fillRect(0, 0, w, h);  // bleary light
  const lid = (1 - open) * h / 2;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, lid); ctx.quadraticCurveTo(w / 2, lid + h * 0.12 * open, 0, lid); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, h - lid); ctx.quadraticCurveTo(w / 2, h - lid - h * 0.12 * open, 0, h - lid); ctx.fill();
  ctx.restore();
}
function showLapModal(lap) {
  const n = lap + 1, word = ORDINALS[n - 1] || `${n}th`;
  showModal(`<b class="lapt">🌅 The ${word} Lap Has Been Achieved!</b>
    <div>You wake up back in the Forgotten Crypt… but the dungeon remembers you.</div>
    <div>⚔ Monsters now have <b>×${LAP.hp} health</b> and <b>×${LAP.atk} damage</b> compared with the last lap (×${fmt(Math.pow(LAP.hp, lap))} and ×${fmt(Math.pow(LAP.atk, lap))} in total).</div>
    <div>📈 Their damage also grows <b>${(LAP_ATK_STEP * lap * 100).toFixed(1)}% faster per floor</b> on this lap than on the first.</div>
    <div>💰 Gold and XP are <b>×2</b> too (×${fmt(Math.pow(2, lap))} in total).</div>
    ${lap === 1 ? '<div>☠ From now on, each zone\'s Guardian and Lord fight you together at the end of the zone.</div>' : ''}
    <button data-act="closeModal">Continue</button>`);
}
function drawCookie() {
  const c = cookiePos(), t = RT.t, pulse = 1 + Math.sin(t * 5) * 0.08, r = c.r * pulse;
  const fade = Math.min(1, RT.cookie.t / 2, (20 - RT.cookie.t) * 3);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(c.x, c.y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4); glow.addColorStop(0, 'rgba(255,215,90,0.55)'); glow.addColorStop(1, 'rgba(255,215,90,0)');
  ctx.fillStyle = glow; ctx.fillRect(-r * 2.4, -r * 2.4, r * 4.8, r * 4.8);
  ctx.rotate(Math.sin(t * 1.3) * 0.3);
  ctx.fillStyle = '#e8a93c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.2, r * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3212';
  for (const [a, d] of [[0.3, 0.45], [2.1, 0.5], [3.7, 0.4], [5, 0.55], [1.2, 0.1]]) ctx.fillRect(Math.cos(a) * r * d - r * 0.12, Math.sin(a) * r * d - r * 0.12, r * 0.24, r * 0.24);
  ctx.restore();
  // sparkles
  for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; ctx.fillStyle = `rgba(255,245,200,${0.5 + 0.5 * Math.sin(t * 6 + i)})`; ctx.fillRect(c.x + Math.cos(a) * r * 1.6, c.y + Math.sin(a) * r * 1.6, Math.max(1, VIEW.s / 2), Math.max(1, VIEW.s / 2)); }
}
function hpBar(cx, y, wdt, frac, color) {
  ctx.fillStyle = '#000a'; ctx.fillRect(Math.round(cx - wdt / 2) - 1, y - 1, wdt + 2, 4);
  ctx.fillStyle = color; ctx.fillRect(Math.round(cx - wdt / 2), y, Math.max(0, Math.round(wdt * frac)), 2);
}
function draw() {
  if (!RT) return;
  const s = VIEW.s, g = VIEW.ground, t = RT.t, h = RT.hero;
  drawBg();
  if (RT.chest) { const b = Math.abs(Math.sin(t * 6)) * 2 * s; drawSprite('chest', null, RT.chest.x, g - b, s, false, false, Math.min(1, 4 - RT.chest.age + 0.3)); }
  // hero
  const x = heroX() + (h.anim > 0 ? 3 * s : 0), bob = RT.phase === 'walk' ? Math.abs(Math.sin(t * 9)) * s : 0;
  drawHeroExtras(x, g, s, t);
  drawHero(x, g - bob, s, h.flash > 0);
  const hatUp = Math.max(0, -(cosOf('helm').y || 0) - 1) * s;
  hpBar(x, g - 13 * s - 3 - hatUp, 10 * s, h.hp / heroStats().hp, '#4caf50');
  // Battle Fury: embers rising off the hero
  if (RT.furyT > 0) { ctx.fillStyle = SKILLS.fury.color; for (let i = 0; i < 3; i++) ctx.fillRect(x + (i - 1) * 4 * s, g - 12 * s - ((t * 30 + i * 13) % (6 * s)), Math.max(1, s / 2), Math.max(1, s / 2)); }
  if (h.stun > 0) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = t * 8 + i * 2.1; ctx.fillRect(x + Math.cos(a) * 4 * s, g - 14 * s + Math.sin(a) * s, s, s); } }
  // sparkles while wearing modified gear (more & rainbow-coloured for the rarest)
  const mods = Object.values(G.hero.gear).flatMap(it => it ? modsOf(it) : []).filter(m => m.sparkle);
  mods.forEach((m, j) => {
    for (let i = 0; i < 2; i++) {
      const p = t * 1.7 + j * 2.3 + i * 3.1, a = (Math.sin(p * 3.7) + 1) / 2;
      ctx.fillStyle = m.fx === 'rainbow' ? `hsla(${(t * 120 + i * 90) % 360},100%,70%,${a})` : m.sparkle;
      ctx.globalAlpha = m.fx === 'rainbow' ? 1 : a;
      ctx.fillRect(x + Math.sin(p) * 7 * s, g - 6 * s + Math.cos(p * 1.3) * 6 * s, Math.max(1, s / 2) + (a > 0.8 ? 1 : 0), Math.max(1, s / 2) + (a > 0.8 ? 1 : 0));
    }
  });
  ctx.globalAlpha = 1;
  // enemies (with two bosses on screen, the second one's name sits higher so the labels don't overlap)
  let bossLabels = 0;
  for (const e of RT.enemies) {
    const sc = s * e.scale, fly = e.fly ? 6 * s + Math.sin(t * 5 + e.bob) * s : 0;
    const ex = e.x - (e.lunge > 0 ? 3 * s : 0);
    const alpha = e.dead ? Math.max(0, 1 - e.dead / 0.45) : 1;
    drawSprite(e.sprite, e.pal, ex, g - fly + (e.dead ? e.dead * 10 * s : 0), sc, true, e.flash > 0, alpha);
    if (!e.dead && (e.hp < e.maxHp || e.boss)) hpBar(ex, g - fly - 12 * sc - 4, (e.boss ? 20 : 10) * s, e.hp / e.maxHp, e.boss ? '#e53935' : '#ef5350');
    if (!e.dead && e.stunT > 0) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = t * 8 + i * 2.1; ctx.fillRect(ex + Math.cos(a) * 4 * sc, g - fly - 13 * sc + Math.sin(a) * s, s, s); } }
    if (!e.dead && e.shield > 0) hpBar(ex, g - fly - 12 * sc - 8, 10 * s, e.shield / e.maxShield, '#64b5f6');
    if (!e.dead && e.trait) {
      ctx.font = `${6 + s * 2}px 'Segoe UI Emoji', sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(TRAIT_BY_ID[e.trait].icon + (e.trait2 ? TRAIT_BY_ID[e.trait2].icon : ''), ex, g - fly - 12 * sc - (e.shield > 0 ? 11 : 7));  // (🏅 Champions show both)
    }
    if (!e.dead && e.immuneT > 0) { ctx.strokeStyle = '#90caf9'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(ex, g - fly - 6 * sc, 8 * sc, 0, Math.PI * 2); ctx.stroke(); }  // ☠ Barrier
    if (e.boss && !e.dead) { ctx.font = `${7 + s * 2}px Pixel, Consolas, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffcf40'; ctx.fillText(e.name, ex, g - fly - 12 * sc - 7 - bossLabels++ * (8 + s * 2)); }
  }
  for (const p of RT.proj) { ctx.fillStyle = p.color; ctx.fillRect(p.x - s, p.y - s, 2 * s, 2 * s); ctx.fillStyle = '#fff8'; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); }
  for (const f of RT.fx) {
    const k = f.t / 0.5;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color || '#90caf9'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(f.x, f.y, (4 + k * 12) * s, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Thunder Strike: a zig-zag bolt down onto its target
  if (RT.bolt) {
    ctx.strokeStyle = SKILLS.thunder.color; ctx.globalAlpha = Math.min(1, RT.bolt.t * 5); ctx.lineWidth = Math.max(1, s / 1.5);
    ctx.beginPath(); ctx.moveTo(RT.bolt.x, 0);
    for (let y = 0, i = 0; y < g - 4 * s; i++) { y += 4 * s; ctx.lineTo(RT.bolt.x + (i % 2 ? 2 : -2) * s, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (RT.cookie) drawCookie();
  if (ui.wake) drawWake();
  ctx.textAlign = 'center';
  for (const f of RT.floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t);
    ctx.font = `bold ${(f.big ? 9 : 7) + s * 2}px Pixel, Consolas, monospace`;  // (bold: Consolas digits are thin next to the pixel font)
    ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y - f.t * 12 * s + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 12 * s);
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  UI (DOM)
// ============================================================
let heroIconUrl = null, heroIconKey = '';
const heroIcon = () => {
  const k = JSON.stringify(G.cos);
  if (heroIconUrl && heroIconKey === k) return heroIconUrl;
  heroIconKey = k; return (heroIconUrl = heroCanvas(false, 0).toDataURL());
};
function updateTop() {
  const f = G.floor, z = zoneOf(f);
  const lap = zoneTier(f), SP = RT && RT.special && SPECIAL_STAGES[RT.special], CH = chalDef(), R = RT && RT.rush;
  const chalTag = CH ? ` <span class="chal" title="${plain(`${CH.name}: ${CH.rule}. Goal: floor ${CH.goal}`)}">${CH.icon}${G.bestFloor}/${CH.goal}${CH.fx.time ? ` ${fmtTime(Math.max(0, CH.fx.time - G.stats.time))}` : ''}</span>${gritLvl() ? ` <span class="chal" title="Grit: stuck for a while, so +${Math.round(GRIT.per * gritLvl() * 100)}% damage & health until your next new floor">💪${Math.round(GRIT.per * gritLvl() * 100)}%</span>` : ''}` : '';
  if (R) $('#floor').innerHTML = `<b class="boss">☠ ${R.k + 1}/${RUSH_LIST.length}</b> <span class="zn">F${R.f} ${ZONES[R.zi].name}</span>${RT.phase === 'fight' ? ` <span class="boss">${Math.ceil(RT.bossT)}s</span>` : ''}`;
  const EV = !G.challenge && eventDef(), evTag = EV ? ` <span class="evt" style="--c:${EV.color}" title="${plain(`${EV.name}: ${EV.desc}`)}">${EV.icon}${Math.ceil(G.event.t / 60)}m</span>` : '';
  if (!R) $('#floor').innerHTML = `<b>F${f}</b>${chalTag}${evTag}${SP ? ` <span class="special" title="${plain(SP.name + ': ' + SP.desc)}">${SP.icon}${RT.special === 'vault' && RT.specialT > 0 ? Math.ceil(RT.specialT) + 's' : ''}</span>` : ''}${lap ? ` <span class="lap" title="Lap ${lap + 1} of the dungeon: monsters ×${fmt(Math.pow(LAP.hp, lap))} health, ×${fmt(Math.pow(LAP.atk, lap))} damage"><span class="lapw">Lap </span>${roman(lap + 1)}</span>` : ''} <span class="zn" title="${plain(zoneFx(f).name + ': ' + zoneFx(f).desc)}">${z.name}</span>${RT && RT.isBoss && RT.phase === 'fight' ? ` <span class="boss">☠ ${Math.ceil(RT.bossT)}s</span>` : ''}${G.farm ? ' <span class="farm">farming</span>' : ''}${replaying() && !G.farm ? ` <span class="replay" title="Replaying floors below your best (${G.bestFloor}): faster, floor skips, ×${REPLAY_BONUS} gold & XP${RT && RT.blitz ? '. Blitzing: too weak to fight you, cleared instantly' : ''}">${RT && RT.blitz ? '⏩⏩' : '⏩'}</span>` : ''}`;
  $('#gold').textContent = fmt(G.gold);
  $('#souls').textContent = fmt(G.souls);
  $('#soulsWrap').hidden = !G.souls && !G.rebirths;
  $('#gems').textContent = fmt(G.gems); $('#gemsWrap').hidden = !G.stats.gemsEarned;
  if (!document.body.classList.contains('compact')) {
    const h = RT && RT.hero, st = heroStats();
    $('#party').innerHTML = `<div class="chip" data-panel="hero" title="${HERO.name}"><img src="${heroIcon()}"><div class="cb"><div class="hpb"><i style="width:${h ? h.hp / st.hp * 100 : 100}%"></i></div><div class="xpb"><i style="width:${G.hero.xp / xpNeed(G.hero.lvl) * 100}%"></i></div></div><span class="lv">${G.hero.lvl}</span></div>`;
    const pb = $('#pushBtn');
    pb.innerHTML = G.farm ? `▶ Push <small>${Math.ceil(retryTime() - G.farmT)}s</small>` : '⟲ Farm';
    pb.classList.toggle('blink', G.farm);
    pb.title = G.farm ? 'Farming this floor. Click to push deeper now (auto-retries when the timer runs out)' : 'Click to stay on this floor and farm it';
    const sb = $('#speedBtn'), fast = gameSpeed() > 1;
    sb.hidden = !speedAvail(); sb.classList.toggle('on', fast);  // (only while replaying floors below your best)
    sb.innerHTML = fast ? '⏩3×' : '▶1×'; sb.title = fast ? 'Game speed 3× while you replay floors below your best. Click for normal speed' : 'Normal speed. Click to replay at 3× (back to 1× on new floors)';
  }
  $('#rbBtn').hidden = !featureOn('rebirth'); $('#forgeBtn').hidden = !featureOn('forge');
  const mb = $('#modeBtn'); mb.hidden = !(G.challenge || featureOn('challenges') || featureOn('rush') || featureOn('exped') || featureOn('lab'));
  mb.classList.toggle('glow', !G.challenge && !R && ((featureOn('rush') && rushWait() <= 0 && !G.settings.autoRush) || (G.exped || []).some(e => Date.now() >= e.end)));
  $('#rbBtn').classList.toggle('glow', soulsFor(G.maxFloor) > 0 && !G.settings.autoRebirth);
  $('#upgBtn').classList.toggle('glow', !(G.settings.autoUpg && featureOn('autoUpg')) && Object.keys(UPGRADES).some(k => upgUnlocked(k) && !upgMaxed(k) && G.gold >= upgCost(k)));
  if (document.body.classList.contains('mini')) { const h = RT && RT.hero; $('#miniHp i').style.width = (h ? h.hp / heroStats().hp * 100 : 100) + '%'; }
  $('#buffs').innerHTML = G.buffs.map(b => `<span class="buff" title="${b.label}">${b.icon}<i>${Math.ceil(b.t)}</i></span>`).join('');
}

function itemHtml(it, extra = '') {
  const R = RARITY[it.r];
  const main = [it.atk ? `⚔${fmt(it.atk)}` : '', it.hp ? `❤${fmt(it.hp)}` : ''].filter(Boolean).join(' ');
  const aff = Object.entries(it.aff).filter(([k]) => AFFIXES[k]).map(([k, v]) => `+${v}${AFFIXES[k].name}`).join(' · ');
  const odds = itemOdds(it);
  const set = it.set && GEAR_SETS[it.set];
  return `<div class="item"><span class="sl">${SLOTS[it.slot].icon}</span><div class="in"><div><b>${nameHtml(it)}</b>${set ? ` <small style="color:${set.color}">[${set.name}]</small>` : ''} <small class="dim">${R.name} · iL${it.ilvl}${it.reforges ? ` · reforged ×${it.reforges}` : ''}${it.forged ? ' · 🔱 ascended' : ''}${it.fated ? ' · 🌠 fated' : ''}</small> <span class="main">${main}</span></div>${aff ? `<div class="aff">${aff}</div>` : ''}${odds < RARE_ODDS && !it.forged ? `<div class="odds">🎲 ${fmtOdds(odds)} drop</div>` : ''}${extra}</div></div>`;
}
// items rarer than a Legendary drop get their odds shown underneath
const RARE_ODDS = RARITY[4].w / RARITY.reduce((a, r) => a + r.w, 0);
// items from before odds were recorded: estimate with today's odds
function itemOdds(it) {
  if (it.odds) return it.odds;
  let p = rarityProbs(false)[it.r] || 1;
  if (it.mod && MOD_BY_ID[it.mod]) p *= modProbs(false, MOD_BY_ID[it.mod].kind)[it.mod];
  if (it.flavour && MOD_BY_ID[it.flavour]) p *= modProbs(false, 'flavour')[it.flavour];
  return p;
}
// live odds table: what a normal drop and a boss drop can be right now
function dropChancesHtml() {
  const st = heroStats(), rn = rarityProbs(false), rb = rarityProbs(true);
  const row = (label, a, b) => `<tr><td>${label}</td><td>${fmtOdds(a)}</td><td>${fmtOdds(b)}</td></tr>`;
  const modRows = kind => { const n = modProbs(false, kind), b = modProbs(true, kind); return MODIFIERS.filter(m => m.kind === kind).map(m => row(`${m.icon} ${m.name}`, n[m.id], b[m.id])).join(''); };
  const per = n => fmt(n) + (n % 1 ? ' on average' : '');
  return `<div class="small">A kill drops loot ${fmtOdds(dropChance(G.floor))} of the time${earlyLoot(G.floor) > 1 ? ` (×${earlyLoot(G.floor).toFixed(1)} on early floors)` : ''} · ${per(itemsPerDropAvg(false))} item${itemsPerDropAvg(false) > 1 ? 's' : ''} per drop (${per(itemsPerDropAvg(true))} from bosses) · bosses drop an amulet ${fmtOdds(amuletChance())} of the time</div>
  <table class="odds-t"><tr><th>Rarity</th><th>Per item</th><th>Boss item</th></tr>
  ${RARITY.map((r, i) => row(`<span style="color:${r.color}">${r.name}</span>`, rn[i], rb[i])).join('')}
  <tr><th colspan="3">Power modifiers</th></tr>${modRows('power')}
  <tr><th colspan="3">Flavour modifiers</th></tr>${modRows('flavour')}</table>
  <div class="small dim">Includes your loot bonuses, Refined Taste and any active cookie buff. Power and flavour roll separately, so an item can have one of each.</div>
  ${fateHtml()}${setGuideHtml()}`;
}
// 🛡 every gear set: its bonuses, where it's found, and whether you've worn the full set
function setGuideHtml() {
  const full = G.stats.setsFull || {};
  const rows = Object.entries(GEAR_SETS).map(([id, S]) => `<div class="uprow ${full[id] ? 'got' : ''}"><div class="grow"><b style="color:${S.color}">${S.name}</b>${full[id] ? ' <span class="up small">✔ full set worn</span>' : ''}
    <div class="desc">${SET_TIERS.filter(t => S[t]).map(t => `${t}: ${fxText(S[t])}`).join(' · ')}</div><div class="now">found most in: ${(S.zones || []).join(', ')}</div></div></div>`).join('');
  return `<div class="small wcat">🛡 Gear sets</div><div class="small dim">${Math.round(SET_CHANCE * 100)}% of Epic-or-better items belong to a set. Half of those come from the zone's home sets, so farm where a set lives to finish it.${labMult('sets') > 1 ? ' 🛡 Set Theory: bonuses ×1.5.' : ''}</div>${rows}`;
}
// 🌠 Fate progress: items since the last drop of each jackpot tier, and how far off the guaranteed one is
function fateHtml() {
  const rows = Object.keys(FATE).map(Number).map(t => {
    const R = RARITY[t], n = (G.fate || {})[t] || 0, need = FATE[t];
    return `<div class="uprow"><div class="grow"><b style="color:${R.color}">${R.name}</b> <span class="dim small">guaranteed every ${fmt(need)} items without one</span>
      <div class="pbar"><i style="width:${n / need * 100}%"></i><span>${fmt(n)} / ${fmt(need)}</span></div></div></div>`;
  }).join('');
  return `<div class="small wcat">🌠 Fate</div><div class="small dim">Every item that drops counts toward each of these. When a bar fills, your next drop is that rarity. Finding one by luck (or anything rarer) resets its bar, and the bars of every lower tier. Kept through rebirths.</div>${rows}`;
}
const PANELS = {};
PANELS.finds = () => {
  const wearing = new Set(Object.values(G.hero.gear).filter(Boolean).map(i => i.id));
  return { bar: backTab + `<span class="tabnote">${G.finds.length} found · rarer than 1 in 100,000, or Ascended+</span>`,
    body: G.finds.length ? G.finds.map(f => itemHtml(f, `<div class="findinfo">Floor ${f.foundFloor} · run #${f.run} · ${new Date(f.foundAt).toLocaleDateString()}${wearing.has(f.id) ? ' · <b class="up">wearing</b>' : ''}</div>`)).join('')
      : '<p class="dim small">Nothing yet. Every item rarer than 1 in 100,000 is recorded here for good, even after you sell it or rebirth.</p>' };
};
PANELS.hero = () => {
  const h = G.hero, st = heroStats(), known = Object.keys(SKILLS).filter(skillKnown).length;
  const tabs = [['gear', '⚔ Gear'], ['skills', `🌀 Skills ${known}/${Object.keys(SKILLS).length}`], ['drops', '🎲 Drops'], ['log', '📜 Log']];
  const nav = `<span class="tabsep"></span><button class="tab gemtab" data-panel="gems" title="Gems: skill training, relics & daily bounties">💎${fmt(G.gems)}</button><button class="tab" data-panel="bestiary" title="Bestiary">📖</button><button class="tab" data-panel="finds" title="Rare finds (${G.finds.length})">🏆</button><button class="tab" data-panel="ach" title="Achievements (${achCount()}/${ACHIEVEMENTS.length})">🏅</button><button class="tab" data-panel="wardrobe" title="Wardrobe">🎨</button><button class="tab" data-panel="stats" title="Stats & history">📊</button>`;
  const body = {
    gear: () => `<div class="row"><span><img class="hicon" src="${heroIcon()}"> <b style="color:${HERO.color}">${HERO.name}</b> Lv ${h.lvl}</span><small class="dim">${fmt(h.xp)} / ${fmt(xpNeed(h.lvl))} XP</small></div>
  <div class="bar"><i style="width:${h.xp / xpNeed(h.lvl) * 100}%"></i></div>
  <div class="stats"><span>⚔ ${fmt(st.atk)}</span><span>❤ ${fmt(st.hp)}</span><span title="${st.spdOver > 1 ? `Attack speed is capped at ${ATTACK_SPEED_CAP}/s: the extra ×${fmt(st.spdOver)} speed becomes bonus health and damage` : ''}">⚡ ${st.spd.toFixed(2)}/s${st.spdOver > 1 ? ' (max)' : ''}</span><span>✦ ${st.crit.toFixed(1)}%</span><span title="Critical hits deal this many times normal damage">💥 ×${fmt(1 + st.critD / 100)}</span><span>DPS ${fmt(st.dps)}</span>${st.leech ? `<span>🩸 ${st.leech.toFixed(1)}%</span>` : ''}${st.gold ? `<span>💰 +${st.gold.toFixed(0)}%</span>` : ''}${st.xp ? `<span>📘 +${st.xp.toFixed(0)}%</span>` : ''}${st.loot ? `<span>🍀 +${st.loot.toFixed(0)}%</span>` : ''}</div>
  ${Object.keys(SLOTS).map(sl => h.gear[sl] ? itemHtml(h.gear[sl]) : `<div class="item empty"><span class="sl">${SLOTS[sl].icon}</span><span class="dim">No ${sl} yet</span></div>`).join('')}
  ${setsHtml(st.sets)}
  ${amuletHtml(G.amulet)}${hasRelic('twin') ? (G.amulet2 ? amuletHtml(G.amulet2) : '<div class="item empty"><span class="sl">📿</span><span class="dim">Second amulet slot (Twin Chains): your next-best amulet goes here</span></div>') : ''}
  <div class="small zonefx">🌍 ${zoneOf(G.floor).name}: <b>${zoneFx(G.floor).name}</b> · ${zoneFx(G.floor).desc}${zoneSets(zoneOf(G.floor)).length ? ` · 🛡 home of the ${zoneSets(zoneOf(G.floor)).map(id => `<span style="color:${GEAR_SETS[id].color}">${GEAR_SETS[id].name}</span>`).join(' & ')} set${zoneSets(zoneOf(G.floor)).length > 1 ? 's' : ''}` : ''}</div>
  <p class="dim small">Loot equips itself when it makes you stronger and is sold otherwise.${st.spdOver > 1 ? ` Attack speed is capped at ${ATTACK_SPEED_CAP} hits/s; the extra ×${fmt(st.spdOver)} speed becomes bonus health and damage.` : ''}${st.critOver > 0 ? ` Crit chance past 100% (+${fmt(st.critOver)}%) is added to crit damage.` : ''}${achCount() ? ` 🏅 Achievements: ×${achMult().toFixed(2)} damage, health & gold.` : ''}</p>`,
    skills: () => `<div class="small dim">Learned by levelling up, used automatically.</div>${skillsHtml()}`,
    drops: dropChancesHtml,
    log: () => G.log.map(l => `<div class="small">${l.html}</div>`).join('') || '<div class="small dim">Nothing yet</div>',
  };
  return { bar: tabBar('hero', tabs, nav), body: body[tabOf('hero', tabs)]() };
};
// learned skills, then the next one to learn (the rest stay a surprise)
function skillsHtml() {
  const all = Object.entries(SKILLS), known = all.filter(([k]) => skillKnown(k)), next = all.find(([k]) => !skillKnown(k));
  const rows = known.map(([k, S]) => {
    const own = G.skills[k] || {}, cd = skillCd(k);
    return `<div class="uprow" title="${plain(S.desc)}"><span class="uicon">${S.icon}</span><div class="grow"><b style="color:${S.color}">${evolved(k) ? SKILL_EVO[k].name : S.name}</b> <span class="dim small">every ${cd.toFixed(1)}s${skillRank(k) ? ` · rank ${skillRank(k)}` : ''}</span><div class="desc">${S.desc}${evolved(k) ? ` <span class="up">✦ ${SKILL_EVO[k].desc}</span>` : ''}</div></div>
      <label class="set"><input type="checkbox" data-act="skill" data-id="${k}" ${own.on ? 'checked' : ''}> on</label></div>`;
  });
  if (next) {
    const [k, S] = next, seen = G.seen['skill_' + k], left = all.length - known.length - 1;
    rows.push(`<div class="uprow locked"><span class="uicon">🔒</span><div class="grow"><b>${seen ? S.name : '???'}</b> <span class="dim small">learned at level ${S.lvl}</span><div class="desc dim">${seen ? S.desc : 'A new skill.'}${left ? ` ${left} more after that.` : ''}</div></div></div>`);
  }
  return rows.join('') || '<div class="small dim">No skills yet.</div>';
}
// 🛡 set bonuses you're wearing (and what the next piece would add)
const fxText = fx => Object.entries(fx).map(([k, v]) => `+${v}${AFFIXES[k] ? AFFIXES[k].name : ' ' + k}`).join(', ');
function setsHtml(sets) {
  const rows = Object.entries(sets || {}).map(([id, n]) => {
    const S = GEAR_SETS[id], sm = labMult('sets'), sc = fx => Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, +(v * sm).toFixed(1)]));
    const parts = SET_TIERS.filter(t => S[t]).map(t => `<span class="${n >= t ? 'up' : 'dim'}">${t}: ${fxText(sc(S[t]))}</span>`).join(' · ');
    return `<div class="small"><b style="color:${S.color}">${S.name} set</b> ${n}/4 · ${parts}</div>`;
  });
  return rows.length ? `<div class="setbox">${rows.join('')}</div>` : '';
}
function amuletHtml(a) {
  if (!a) return `<div class="item empty"><span class="sl">📿</span><span class="dim">No amulet yet · bosses sometimes drop one (${fmtOdds(amuletChance()).replace(/<[^>]+>/g, '')})</span></div>`;
  const T = AMULET_TIERS[a.r];
  return `<div class="item"><span class="sl">📿</span><div class="in"><div><b>${amuletName(a)}</b> <small class="dim">${T.name} amulet</small></div><div class="aff">${amuletFxText(a)}</div></div></div>`;
}
// current total effect, shown under each upgrade/perk description
function upgNow(k) {
  const l = baseLv(k), x = what => `×${fmt(upgMult(k))} ${what}`, M = UPGRADES[k].mastery, ml = masteryLv(k);
  const now = { damage: x('damage'), health: x('health'), speed: x('attack speed'), critChance: `+${l}% crit chance`,
    critDmg: x('crit damage'), gold: x('gold'), xp: x('XP'), loot: x('loot drops'),
    leech: `+${fmt(0.5 * l)}% lifesteal`,
    prospector: `+${fmt(10 * l)}% gold from sold items`, chesthunter: `chests +${fmt(CHEST.hunterFreq * 100 * l)}% more often, +${fmt(CHEST.hunterGold * 100 * l)}% chest gold`,
    keeneye: `+${fmt(2 * l)}% modifier chance`, regrowth: `heal ${fmt(0.2 * l)}% of max health per kill`,
    thickskin: `-${fmt(l)}% damage from bosses`, deflect: `-${fmt(3 * l)}% damage from ranged attacks` }[k]
    // stat-adding upgrades: "+15% armor"
    || Object.entries(UPGRADES[k].add || {}).map(([s, v]) => `+${fmt(v * l)}${AFFIXES[s].name}`).join(', ');
  const [ms, mm] = M ? Object.entries(M)[0] : [];
  return now + (ml ? ` · ✪ ×${fmt(Math.pow(mm, ml))} ${MASTERY_NAMES[ms]}` : '');
}
// the description shown for an upgrade: once maxed, what each Mastery level gives instead
function upgDesc(k) {
  const U = UPGRADES[k];
  if (!U.mastery || G.upg[k] < U.max) return U.desc + (U.mastery ? ` <span class="dim">(max ${U.max}, then ✪ Mastery)</span>` : '');
  const [s, m] = Object.entries(U.mastery)[0];
  return `✪ Mastery: ×${m.toFixed(3)} ${MASTERY_NAMES[s]} per level`;
}
function perkNow(k) {
  const l = G.perks[k];
  const c = `×${fmt(perkCompound(k))}`;
  return { soul: `×${fmt(soulMult())} attack & health`, scholar: `+${fmt(30 * l)}% XP, then ${c}`, hunter: `+${fmt(20 * l)}% loot, then ${c}`,
    slayer: `+${fmt(30 * l)}% boss damage, then ${c}, +${5 * l}s timer`,
    relentless: `retry after ${retryTime()}s`, dream: `${Math.round(offlineEff() * 100)}% offline efficiency`,
    bounty: `${fmt(itemsPerDropAvg(false))} items per drop on average, ${fmt(itemsPerDropAvg(true))} from bosses`,
    refine: `lowest drop rarity: ${RARITY[minRarity()].name}`,
    companion: `strikes for ${8 * l}% of your attack every second`, sweet: `cookies ×${(1 + 0.15 * l).toFixed(2)} as often`,
    magnet: `chests ×${(1 + CHEST.magnetFreq * l).toFixed(2)} as often, +${Math.round(CHEST.magnetGold * 100 * l)}% gold`, trophy: `amulet chance ${fmtOdds(amuletChance()).replace(/<[^>]+>/g, '')} per boss`,
    phoenix: `revive with ${25 * l}% health, once per floor`,
    headstart: `keep ${HEADSTART_PER * l}% of upgrade levels (Sharpen ${G.upg.damage} → ${Math.floor(G.upg.damage * HEADSTART_PER * l / 100)}), start on floor ${headStartFloor()}` }[k];
}
PANELS.upg = () => {
  const next = Object.keys(UPGRADES).filter(k => !upgUnlocked(k)).sort((a, b) => UPGRADES[a].at - UPGRADES[b].at)[0];
  const lvl = (k, U) => { const l = G.upg[k]; if (!U.max) return `Lv ${l}`; return l > U.max && U.mastery ? `Lv ${U.max}/${U.max} <span class="mastery">✪${l - U.max}</span>` : `Lv ${l}/${U.max}`; };
  const canBuy = k => upgUnlocked(k) && !upgMaxed(k) && G.gold >= upgCost(k);
  // a tab per group that has something unlocked, with a count of what you can afford right now
  const tabs = Object.entries(UPG_TABS).filter(([, T]) => T.keys.some(upgUnlocked))
    .map(([id, T]) => { const n = T.keys.filter(canBuy).length; return [id, `${T.name}${n ? ` <b class="cnt">${n}</b>` : ''}`]; });
  const bm = G.settings.buyMode || 1;
  const modes = `<span class="tabsep"></span>${[1, 10, 'max'].map(m => `<button class="tab ${bm === m ? 'on' : ''}" data-act="buyMode" data-id="${m}" title="Buy ${m === 'max' ? 'as many as you can afford' : m + ' level' + (m > 1 ? 's' : '')} per click">${m === 'max' ? 'Max' : '×' + m}</button>`).join('')}`;
  const auto = featureOn('autoUpg') ? `<label class="tabauto" title="Auto-buy upgrades (cheapest first)"><input type="checkbox" data-act="toggle" data-id="autoUpg" ${G.settings.autoUpg ? 'checked' : ''}>Auto</label>` : '';
  const keys = UPG_TABS[tabOf('upg', tabs)].keys.filter(upgUnlocked);
  const body = `${chalRule('noUpg') ? `<div class="small warn">${chalDef().icon} ${chalDef().name} challenge: gold upgrades are locked in this run</div>` : ''}${keys.map(k => {
    const U = UPGRADES[k], max = upgMaxed(k), { n, cost } = upgBulk(k);
    const skip = autoSkipped(k), tog = featureOn('autoUpg') ? `<button class="sm autotog ${skip ? 'off' : ''}" data-act="autoSkip" data-id="${k}" title="${skip ? 'Auto-buy skips this upgrade. Click to include it' : 'Auto-buy includes this upgrade. Click to exclude it'}">A</button>` : '';
    return `<div class="uprow" title="${plain(upgDesc(k))}"><span class="uicon">${U.icon}</span><div class="grow"><b>${U.name}</b> <span class="dim">${lvl(k, U)}</span><div class="desc">${upgDesc(k)}</div>${G.upg[k] ? `<div class="now">now ${upgNow(k)}</div>` : ''}</div>${tog}<button data-act="upg" data-id="${k}" ${max || !n || G.gold < cost ? 'disabled' : ''}>${max ? 'MAX' : `${n > 1 ? `<small>×${n}</small> ` : ''}${fmt(cost)}g`}</button></div>`;
  }).join('')}
  ${next ? `<div class="uprow locked"><span class="uicon">🔒</span><div class="grow"><b>${UPGRADES[next].name}</b> <span class="dim small">unlocks at floor ${UPGRADES[next].at}</span></div></div>` : ''}
  ${featureOn('autoUpg') ? '' : `<div class="small dim">🔒 Auto-buy unlocks at floor ${FEATURES.autoUpg.at}</div>`}
  <p class="dim small">Upgrades reset when you rebirth.</p>`;
  return { bar: tabBar('upg', tabs, modes + auto), body };
};
PANELS.rebirth = () => {
  const gain = soulsFor(G.maxFloor);
  const next = G.maxFloor < REBIRTH_MIN_FLOOR ? `Reach floor ${REBIRTH_MIN_FLOOR} to rebirth.` : `Rebirth now for <b class="soul">+${fmt(gain)} souls</b>. Deeper floors give more.`;
  const btn = gain ? (ui.confirm === 'rebirth'
    ? `<div class="warn">This resets your floor, hero level, gold, upgrades and reinforcement. Gear, souls and perks are kept. <button class="danger" data-act="doRebirth">Rebirth</button> <button data-act="cancel">Cancel</button></div>`
    : `<button class="soulbtn" data-act="askRebirth">✦ Rebirth (+${fmt(gain)})</button>`) : '';
  const S = G.settings;
  const auto = `<div class="autobox"><label class="set"><input type="checkbox" data-act="toggle" data-id="autoRebirth" ${S.autoRebirth ? 'checked' : ''}> Auto-rebirth when stuck for
    <select data-set="rebirthStuck">${[2, 5, 10, 20, 30].map(m => `<option value="${m}" ${S.rebirthStuck === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
    <label class="set"><input type="checkbox" data-act="toggle" data-id="autoPerks" ${S.autoPerks ? 'checked' : ''}> Auto-spend souls on perks</label>
    ${S.autoRebirth ? `<div class="dim small">${gain ? `No new floor for ${fmtTime(G.stuckT)} of ${S.rebirthStuck}m` : `Waiting for floor ${REBIRTH_MIN_FLOOR}`}</div>` : ''}</div>`;
  const canPerk = k => !(PERKS[k].max && G.perks[k] >= perkMax(k)) && G.souls >= perkCost(k);
  const nPerk = Object.keys(PERKS).filter(k => perkUnlocked(k) && canPerk(k)).length;
  const nStar = Object.keys(CONSTELLATIONS).filter(id => ((G.stars || {})[id] || 0) < CONSTELLATIONS[id].nodes.length && (G.stardust || 0) >= starCost(id)).length;
  const tabs = [['rb', '✦ Rebirth'], ['perks', `⭐ Perks${nPerk ? ` <b class="cnt">${nPerk}</b>` : ''}`]];
  if (featureOn('stars')) tabs.push(['stars', `✧ Stars${nStar ? ` <b class="cnt">${nStar}</b>` : ''}`]);
  if (featureOn('oath')) tabs.push(['oath', `⚜ Oath${!G.oath ? ' <b class="cnt">!</b>' : ''}`]);
  if (featureOn('awaken')) tabs.push(['awaken',`🌅 Awaken${essenceGain() ? ` <span class="dim">+${essHtml(essenceGain())}</span>` : ''}`]);
  const soulsLine = `<div class="row"><span>Souls: <b class="soul">${fmt(G.souls)}</b></span><span class="dim small">Best floor ${G.bestFloor} · Rebirths ${G.rebirths}</span></div>`;
  const t = tabOf('rebirth', tabs);
  if (t === 'stars') {
    const lit = Object.values(G.stars || {}).reduce((a, b) => a + b, 0), all = Object.values(CONSTELLATIONS).reduce((a, c) => a + c.nodes.length, 0);
    const rows = Object.entries(CONSTELLATIONS).map(([id, C]) => {
      const n = (G.stars || {})[id] || 0, done = n >= C.nodes.length, c = done ? 0 : starCost(id);
      const dots = C.nodes.map((fx, i) => `<span class="${i < n ? 'up' : 'dim'}" title="${plain(starFxText(fx))}">${i < n ? '★' : '☆'}</span>`).join('');
      return `<div class="uprow ${done ? 'got' : ''}"><span class="uicon">${C.icon}</span><div class="grow"><b style="color:${C.color}">${C.name}</b> <span class="small">${dots}</span>
        <div class="desc">${done ? 'Every star lit' : `Next star: <b>${starFxText(C.nodes[n])}</b>`}</div>${n ? `<div class="now">lit: ${C.nodes.slice(0, n).map(starFxText).join(' · ')}</div>` : ''}</div>
        ${done ? '' : `<button class="starbtn" data-act="star" data-id="${id}" ${(G.stardust || 0) < c ? 'disabled' : ''}>✧${fmt(c)}</button>`}</div>`;
    }).join('');
    return { bar: tabBar('rebirth', tabs), body: `<div class="row"><span>Stardust: <b class="star">✧ ${fmt(G.stardust || 0)}</b></span><span class="dim small">${lit}/${all} stars lit · kept forever</span></div>
      <div class="small dim intro">Every floor you beat for the first time pays Stardust: ${STAR.boss}× on boss floors, and more each lap (lap 2: 1 a floor, lap 3: 2, …). New Boss Rush records pay too. Each constellation's stars light in order, and each one costs twice the last.</div>${rows}` };
  }
  if (t === 'oath') {
    const can = canSwear(), cur = G.oath && OATHS[G.oath];
    const rows = Object.entries(OATHS).map(([k, O]) => {
      const lv = oathLvl(k), xp = (G.oathXp || {})[k] || 0, next = 10 * Math.pow(lv + 1, 2), on = G.oath === k;
      return `<div class="uprow ${on ? 'got' : ''}"><span class="uicon">${O.icon}</span><div class="grow"><b style="color:${O.color}">${O.name}</b> <span class="dim small">mastery ${lv}/${OATH.max}${lv < OATH.max ? ` · ${fmt(xp)}/${fmt(next)}` : ''}</span>
        <div class="desc">${O.desc}: <span class="up">${oathText(O.up, lv)}</span> · <span class="bad">${oathText(O.down)}</span></div></div>
        ${on ? '<span class="up small">sworn</span>' : `<button data-act="swear" data-id="${k}" ${can ? '' : 'disabled'}>Swear</button>`}</div>`;
    }).join('');
    return { bar: tabBar('rebirth', tabs), body: `<div class="small">${cur ? `Sworn this run: <b style="color:${cur.color}">${cur.icon} ${cur.name}</b>` : '<b>No Oath sworn</b>: pick one below (you can change it right after a rebirth)'}</div>
      <div class="small dim intro">An Oath gives a big bonus and a drawback for the whole run. You can swear one any time you have none; changing it is only possible early in a run (floor ${OATH.pickUntil} or below, e.g. right after a rebirth). It stays sworn through rebirths until you change it. Every floor you fight and beat under an Oath adds mastery: each level makes its bonus +${OATH.per * 100}% stronger.${can ? '' : ` <b>You're past floor ${OATH.pickUntil} this run, so it's locked until your next rebirth.</b>`}</div>${rows}` };
  }
  if (t === 'awaken') {
    const gain = essenceGain(), S = awakenSouls(), nextAt = Math.pow((gain + 1) / starMult('essence'), 1 / AWAKEN.exp) * AWAKEN.per;
    const caps = Object.entries(AWAKEN.caps).map(([k, [per, most]]) => `${PERKS[k].name} +${Math.min(most, Math.floor(essence() * per))}<span class="dim">/${most}</span>`).join(', ');
    const btn = !gain ? `<button disabled>🌅 Awaken (1 Essence needs ${fmt(AWAKEN.per)} souls)</button>`
      : ui.confirm === 'awaken' ? `<div class="warn">Awaken for <b>+${essHtml(gain)} Essence</b>? Your souls (${fmt(G.souls)}), every perk level and this run start over. Gear, stash, gems, relics, Stardust, stars, scrap, pets, achievements and records all stay. <button class="danger" data-act="doAwaken">Awaken</button> <button data-act="cancel">Cancel</button></div>`
      : `<button class="soulbtn" data-act="askAwaken">🌅 Awaken (+${essHtml(gain)} Essence)</button>`;
    return { bar: tabBar('rebirth', tabs), body: `<div class="row"><span>Essence: <b class="ess">🔹 ${essHtml(essence())}</b></span><span class="dim small">${G.awakenings ? `Awakened ${G.awakenings}×` : 'not awakened yet'} · only the 🔷 Essence Chest spends it</span></div>
      <div class="small">Now: <span class="up">×${fmt(essSouls())} souls from rebirths · ×${fmt(essPower())} damage & health</span></div>
      <div class="small dim">Perk caps raised: ${caps}</div>
      <div class="small dim intro">Awakening trades every soul you've earned since the last one (${fmt(S)}, counting what rebirthing now would pay) for Essence: ∛(souls ÷ ${fmt(AWAKEN.per)}), counting souls without your Essence's own soul bonus. Each point: +${AWAKEN.souls * 100}% souls from rebirths, +${AWAKEN.power * 100}% damage & health, and higher caps for some perks.${gain ? ` Next point at ${fmt(nextAt)} souls.` : ''}</div>
      ${btn}` };
  }
  const body = t === 'rb' ? `${soulsLine}<p class="small">${next}</p>${btn}${G.rebirths ? auto : ''}${nPerk ? `<div class="small">⭐ You can afford ${nPerk} perk${nPerk > 1 ? 's' : ''}: see the Perks tab.</div>` : ''}`
    : `${soulsLine}${Object.entries(PERKS).filter(([k]) => perkUnlocked(k)).map(([k, P]) => {
    const max = P.max && G.perks[k] >= perkMax(k), { n: bn, cost: c } = perkBulk(k);
    return `<div class="uprow" title="${plain(P.desc)}"><div class="grow"><b>${P.name}</b> <span class="dim">Lv ${G.perks[k]}${P.max ? '/' + perkMax(k) : ''}${P.max && perkMax(k) > P.max ? ' <span class="up" title="Raised by 🌅 Essence">🌅</span>' : ''}</span><div class="desc">${P.desc}</div>${G.perks[k] ? `<div class="now">now ${perkNow(k)}</div>` : ''}</div><button class="soulbtn" data-act="perk" data-id="${k}" ${max || !bn || G.souls < c ? 'disabled' : ''}>${max ? 'MAX' : `${bn > 1 ? `<small>×${bn}</small> ` : ''}${fmt(c)} ✦`}</button></div>`;
  }).join('')}
  ${(() => { const n = Object.keys(PERKS).filter(k => !perkUnlocked(k)).sort((a, b) => PERKS[a].at - PERKS[b].at)[0]; return n ? `<div class="uprow locked"><div class="grow"><b>🔒 ${PERKS[n].name}</b> <span class="dim small">revealed at floor ${PERKS[n].at}</span></div></div>` : ''; })()}`;
  const pm = G.settings.perkBuyMode || 1;
  const modes = t === 'perks' ? `<span class="tabsep"></span>${[1, 10, 'max'].map(m => `<button class="tab ${pm === m ? 'on' : ''}" data-act="perkBuyMode" data-id="${m}" title="Buy ${m === 'max' ? 'as many levels as you can afford' : m + ' level' + (m > 1 ? 's' : '')} per click">${m === 'max' ? 'Max' : '×' + m}</button>`).join('')}` : '';
  return { bar: tabBar('rebirth', tabs, modes), body };
};
// "<Rarity> or better" dropdown, plus Off (stored as 99)
const raritySelect = (key, val) => `<select data-set="${key}">${RARITY.map((r, i) => `<option value="${i}" ${val === i ? 'selected' : ''}>${r.name}+</option>`).join('')}<option value="99" ${val === 99 ? 'selected' : ''}>Off</option></select>`;
const autoTemperBox = () => `<label class="set" title="Every 15 seconds: a stashed item that would beat what you wear once tempered to your best floor is tempered (if you have the scrap) and put on"><input type="checkbox" data-act="toggle" data-id="autoTemper" ${G.settings.autoTemper ? 'checked' : ''}> 🔨 Auto-temper stashed items that would be an upgrade${G.stats.autoTempers ? ` <span class="dim small">(${fmt(G.stats.autoTempers)} so far)</span>` : ''}</label>`;
PANELS.forge = () => {
  const tabs = [['reinforce', '⚒ Reinforce'], ['reforge', '🎲 Reforge'], ['temper', '🔨 Temper'], ['stash', `🎒 Stash <span class="dim">${(G.stash || []).length}</span>`], ['chest', '📦 Chests']], t = tabOf('forge', tabs);
  const scrapLine = `<div class="row"><span>Scrap: <b class="scrap">🔩 ${fmt(G.scrap || 0)}</b></span><span class="dim small" title="Items found on floors below your best give ${REPLAY_SCRAP * 100}% of the scrap">from selling Rare+ items (${REPLAY_SCRAP * 100}% if found on a replayed floor) · kept through rebirths</span></div>`;
  const bar = tabBar('forge', tabs, `<span class="tabsep"></span><span class="tabnote scrap">🔩${fmt(G.scrap || 0)}</span>`);
  const empty = (s, S) => `<div class="item empty"><span class="sl">${S.icon}</span><span class="dim">No ${s}</span></div>`;
  if (t === 'reforge') return { bar, body: `${scrapLine}<div class="small dim intro">Roll new bonus stats for an item you're wearing, then keep the new roll or revert to the old one. Rarity, main stats, modifiers and set stay.</div>
  <div class="set" title="Auto-reforge leaves an item alone once its chance to improve is this low (it starts again if the chance goes back up)">Auto-reforge stops on an item when its chance to improve is below
    <select data-set="autoReforgeStop">${[[0, 'never'], [1, '1%'], [5, '5%'], [10, '10%'], [20, '20%']].map(([v, l]) => `<option value="${v}" ${(G.settings.autoReforgeStop || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="small dim">Auto-reforge only runs while this tab is open, and each item stops after using ${AUTO_REFORGE_BUDGET * 100}% of your scrap${autoRefOn() ? ` (🔩${fmt(autoRefBudget())} each this time)` : ''}, so two items can use ${AUTO_REFORGE_BUDGET * 200}% in total.</div>
  ${Object.entries(SLOTS).map(([s, S]) => { const it = G.hero.gear[s]; if (!it) return empty(s, S); const c = reforgeCost(s);
    if (it.pending) {
      const cur = heroStats(), alt = computeStats(Object.assign({}, G.hero.gear, { [s]: Object.assign({}, it, { aff: it.pending }) })), gain = rating(alt) / rating(cur) - 1;
      const aff = a => Object.entries(a).map(([k, v]) => `+${v}${AFFIXES[k].name}`).join(' · ');
      return `${itemHtml(it)}<div class="pending"><div class="small">New roll: <span class="aff">${aff(it.pending)}</span></div><div class="small ${gain >= 0 ? 'up' : 'bad'}">${gain >= 0 ? '▲' : '▼'} ${(Math.abs(gain) * 100).toFixed(1)}% overall</div>
        <div class="reforge"><button data-act="reforgeKeep" data-id="${s}">✔ Keep new</button> <button data-act="reforgeRevert" data-id="${s}">↩ Revert</button></div></div>`;
    }
    const ch = reforgeChance(s), pct = ch.p * 100, auto = s in autoRef.slots;
    const verdict = pct < 1 ? '<span class="bad">almost never worth it</span>' : pct < 5 ? '<span class="bad">rarely worth it</span>' : pct < 20 ? '<span class="dim">sometimes worth it</span>' : '<span class="up">often worth it</span>';
    const stopped = auto && G.settings.autoReforgeStop && pct < G.settings.autoReforgeStop;
    return `${itemHtml(it)}<div class="small" title="Estimated from ${REFORGE_SAMPLES} test rolls of this item's bonus stats against what it has now">🎲 A reforge makes it better <b>${pct < 0.5 ? 'under 0.5' : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%</b> of the time${ch.avg ? ` (by +${(ch.avg * 100).toFixed(1)}% on average when it does)` : ''} · ${verdict}</div>
      <div class="reforge"><label class="set autoref" title="Reforge this item once a second: keeps the new roll if it's better, reverts if not"><input type="checkbox" data-act="autoReforge" data-id="${s}" ${auto ? 'checked' : ''}> Auto${stopped ? ' <span class="dim">(paused: below your stop chance)</span>' : auto && G.scrap < c ? ' <span class="dim">(paused: not enough scrap)</span>' : auto ? ` <span class="dim">🔩${fmt(autoRef.slots[s])} / ${fmt(autoRefBudget())}</span>` : ''}</label>
      <button data-act="reforge" data-id="${s}" ${G.scrap < c ? 'disabled' : ''}>🎲 Reforge 🔩${fmt(c)}</button></div>`; }).join('')}` };
  if (t === 'stash') {
    const S = G.settings, keep = S.keepR || {}, cur = rating(heroStats());
    const chips = RARITY.map((R, i) => `<button class="sm keepchip ${keep[i] ? 'on' : ''}" data-act="keepR" data-id="${i}" style="--c:${R.color}" title="${keep[i] ? 'Kept in the stash' : 'Auto-sold'} when it isn't an upgrade. Click to switch">${keep[i] ? '🎒' : '💰'} ${R.name}</button>`).join('');
    // filters: slot chips, lowest rarity, sort order, only upgrades (all remembered in settings)
    const slot = S.stashSlot || 'all', minR = S.stashMinR || 0, sort = S.stashSort || 0, onlyUp = !!S.stashUp;
    // ▲/▼ = this item against the one you wear in its slot, both at the same item level (see stashGain)
    refreshStashQ();
    const rows = (G.stash || []).map(it => ({ it, gain: it.q }))
      .filter(x => (slot === 'all' || x.it.slot === slot) && x.it.r >= minR && (!onlyUp || x.gain > 0));
    rows.sort(sort === 1 ? (a, b) => itemOdds(a.it) - itemOdds(b.it) || b.it.ilvl - a.it.ilvl : sort === 2 ? (a, b) => b.it.ilvl - a.it.ilvl || b.it.r - a.it.r : (a, b) => b.gain - a.gain);
    ui.stashShown = rows.map(x => x.it.id);
    const list = rows.map(({ it, gain }) => {
      const c = itemTemperCost(it), sell = ui.confirm === 'sell:' + it.id;
      return `${itemHtml(it)}<div class="reforge"><span class="small ${gain >= 0 ? 'up' : 'dim'}" title="Compared with the ${it.slot} you wear, with both at the same item level: how much better or worse the item itself is, whatever floor each one dropped on">${gain >= 0 ? '▲' : '▼'} ${(Math.abs(gain) * 100).toFixed(1)}%</span>
        <button class="sm ${it.locked ? 'on' : ''}" data-act="stashLock" data-id="${it.id}" title="${it.locked ? 'Locked: can\'t be sold. Click to unlock' : 'Lock it so it can\'t be sold'}">${it.locked ? '🔒' : '🔓'}</button>
        ${itemGap(it) ? `<button class="sm" data-act="stashTemper" data-id="${it.id}" ${G.scrap < c ? 'disabled' : ''} title="Temper to item level ${temperLevel()} (your best floor)">🔨 🔩${fmt(c)}</button>` : ''}
        <button class="sm" data-act="stashEquip" data-id="${it.id}">Equip</button>${it.locked ? '' : sell ? `<button class="sm danger" data-act="stashSell" data-id="${it.id}" title="Rarer than 1 in 100,000">Sell? ${fmt(sellValue(it))}g</button><button class="sm" data-act="cancel">No</button>`
          : `<button class="sm" data-act="${itemOdds(it) < 1e-5 ? 'askSell' : 'stashSell'}" data-id="${it.id}">Sell ${fmt(sellValue(it))}g</button>`}</div>`;
    }).join('');
    const slotChips = [['all', 'All'], ...Object.entries(SLOTS).map(([k, s]) => [k, s.icon])].map(([k, l]) => `<button class="sm ${slot === k ? 'on' : ''}" data-act="stashSlot" data-id="${k}" title="${k === 'all' ? 'Every slot' : k}">${l} <span class="dim">${k === 'all' ? (G.stash || []).length : (G.stash || []).filter(x => x.slot === k).length}</span></button>`).join('');
    return { bar, body: `${scrapLine}${autoTemperBox()}
      <details class="keepset"><summary class="small">🎒 What to keep instead of selling</summary>
        <div class="small dim">Better gear is always put on by itself, and whatever it replaces comes here only if it meets these rules (otherwise it's sold). Items that aren't an upgrade are auto-sold unless these rules keep them. A stashed item that becomes an upgrade (say, after tempering) is put on automatically. Holds ${stashMax()}; when it's full, a better find replaces your worst unlocked item (items kept for being rare only make way for other rare ones).</div>
        <div class="wrow">${chips}</div>
        <label class="set"><input type="checkbox" data-act="toggle" data-id="keepMods" ${S.keepMods ? 'checked' : ''}> Also keep anything with a modifier</label>
        <label class="set"><input type="checkbox" data-act="toggle" data-id="keepSets" ${S.keepSets ? 'checked' : ''}> Also keep set items</label>
        <div class="set" title="Compared with what you wear in that slot, as if the new item were tempered to your best floor">…but only if, once tempered, it's
          <select data-set="stashMinGain">${[[-99, 'any quality'], [0, 'better than my gear ▲'], [-10, 'at most 10% worse'], [-25, 'at most 25% worse'], [-50, 'at most 50% worse']].map(([v, l]) => `<option value="${v}" ${(S.stashMinGain ?? -99) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="set" title="Its drop odds (the 🎲 line on an item): rarity and modifiers together. Kept even if its rarity isn't ticked above or it fails the quality rule">Always keep anything rarer than
          <select data-set="stashAlways">${[[0, 'off'], [1e3, '1 in 1,000'], [1e4, '1 in 10,000'], [1e5, '1 in 100,000'], [1e6, '1 in 1 million'], [1e7, '1 in 10 million']].map(([v, l]) => `<option value="${v}" ${(S.stashAlways ?? 1e5) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></details>
      <div class="stashbar"><div class="wrow">${slotChips}</div>
        <div class="set"><select data-set="stashMinR" title="Lowest rarity shown">${RARITY.map((R, i) => `<option value="${i}" ${minR === i ? 'selected' : ''}>${R.name}+</option>`).join('')}</select>
        <select data-set="stashSort" title="Sort by">${['best upgrade first', 'rarest first (drop odds)', 'highest item level'].map((l, i) => `<option value="${i}" ${sort === i ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label><input type="checkbox" data-act="toggle" data-id="stashUp" ${onlyUp ? 'checked' : ''}> upgrades only</label></div></div>
      <div class="row small"><span class="wcat">🎒 ${rows.length} shown · ${(G.stash || []).length} / ${stashMax()}</span>${(() => { const sellable = rows.filter(x => !x.it.locked), rare = sellable.filter(x => itemOdds(x.it) < 1e-5).length; return sellable.length ? (ui.confirm === 'sellShown' ? `<span><button class="sm danger" data-act="stashSellShown">Sell ${sellable.length}${rare ? ` (${rare} rarer than 1 in 100k)` : ''}?</button> <button class="sm" data-act="cancel">No</button></span>` : `<button class="sm" data-act="askSellShown" title="Locked items are kept">Sell all shown</button>`) : ''; })()}</div>
      ${list || '<div class="small dim">Nothing here with these filters.</div>'}` };
  }
  if (t === 'temper') return { bar, body: `${scrapLine}<div class="small dim intro">Bring an item you're wearing up to your best floor's item level (${temperLevel()}). It keeps its rarity, modifiers, set and bonus stats, so a great find can stay with you.</div>${autoTemperBox()}
  ${Object.entries(SLOTS).map(([s, S]) => { const it = G.hero.gear[s]; if (!it) return empty(s, S); const gap = temperGap(s), c = temperCost(s);
    return `${itemHtml(it)}<div class="reforge">${gap ? `<span class="small dim">+${gap} item levels (×${fmt(Math.pow(ITEM_FLOOR_GROWTH, gap))} stats)</span> <button data-act="temper" data-id="${s}" ${G.scrap < c ? 'disabled' : ''}>🔨 Temper 🔩${fmt(c)}</button>` : '<span class="small up">already at this floor\'s level</span>'}</div>`; }).join('')}` };
  if (t === 'chest') return { bar, body: `${scrapLine}${featureOn('chestShop') ? Object.entries(SCRAP_CHESTS).map(([k, C]) => { const c = scrapChestCost(k);
    if (!chestOpen(k)) return `<div class="uprow locked"><span class="uicon">🔒</span><div class="grow"><b>${C.name}</b><div class="desc dim">Unlocks on lap ${C.lap} (floor ${(C.lap - 1) * FLOORS_PER_ZONE * ZONES.length + 1})</div></div></div>`;
    // 🔷 the Essence Chest: its Essence price and what it buys
    const sp = C.essence && essenceChestSpend(), et = C.essence && essenceChestTier(sp), noEss = C.essence && essence() < sp;
    const essLine = C.essence ? `<div class="now">🔷 Sacrifice <b>${essHtml(sp)}</b> Essence (${ESSENCE_CHEST.share * 100}% of your ${essHtml(essence())}): <b style="color:${RARITY[et.r].color}">${RARITY[et.r].name}</b>${et.next ? `, ${Math.round(et.next * 100)}% chance of <b style="color:${RARITY[et.r + 1].color}">${RARITY[et.r + 1].name}</b>` : ''} (10× more Essence = one tier higher). Each point of Essence is +${AWAKEN.power * 100}% damage & health, so this costs you ${Math.round(sp / Math.max(1, essPower()) * AWAKEN.power * 100)}% of your Essence power.</div>` : '';
    const n = (G.chestRun || {})[k] || 0, o = chestOdds(k), pct = o.p * 100;
    const odds = `<div class="now ${pct >= 50 ? 'up' : pct < 10 ? 'bad' : ''}" title="Estimated from ${o.n} test rolls (up to ${CHEST_SAMPLES}) against the gear you wear now, with the new item tempered to your best floor. Starts over when your gear changes or every ${CHEST_BUCKET} floors">💡 ≈${pct.toFixed(0)}% chance to beat your gear${o.avg ? ` (by +${(o.avg * 100).toFixed(0)}% on average)` : ''}</div>`;
    return `<div class="uprow" title="${plain(C.desc)}"><span class="uicon">${C.icon}</span><div class="grow"><b>${C.name}</b>${n ? ` <span class="dim small">${n} this run</span>` : ''}<div class="desc">${C.desc}, item level ${Math.round(G.floor * CHEST_ILVL)}. Rolls like a boss drop with ×${C.mod || 1} modifier chance, and any modifier is one of the ${CHEST_TOP_MODS} rarest${Math.ceil((C.mod || 1) / CHEST_PICK_PER) > 1 ? ` (best of ${Math.ceil(C.mod / CHEST_PICK_PER)} picks)` : ''}.${C.attune ? ` <b>Attuned:</b> rolls ${C.attune} items and gives you the best one for your gear.` : ''} ×${CHEST_GROWTH} pricier each time this run</div>${essLine}${odds}</div><button data-act="scrapChest" data-id="${k}" ${G.scrap < c || noEss ? 'disabled' : ''}>🔩${fmt(c)}${C.essence ? `<br>🔷${fmt(sp)}` : ''}</button></div>`; }).join('')
    : `<div class="uprow locked"><span class="uicon">🔒</span><div class="grow"><b>Scrap chests</b><div class="desc dim">Unlock at floor ${FEATURES.chestShop.at}</div></div></div>`}` };
  return { bar, body: `<div class="small dim intro">Reinforce a gear slot to boost the attack & health of whatever you wear there. Reinforcement resets when you rebirth, like upgrades.</div>
  ${featureOn('autoForge') ? `<label class="set" title="Shares gold with auto-buy, cheapest first"><input type="checkbox" data-act="toggle" data-id="autoForge" ${G.settings.autoForge ? 'checked' : ''}> Auto-reinforce</label>` : `<div class="small dim">🔒 Auto-reinforce unlocks at floor ${FEATURES.autoForge.at}</div>`}
  ${Object.entries(SLOTS).map(([s, S]) => {
    const it = G.hero.gear[s], c = forgeCost(s), lv = G.forge[s] || 0;
    return `<div class="uprow"><span class="uicon">${S.icon}</span><div class="grow"><b>${s[0].toUpperCase() + s.slice(1)}</b> <span class="dim">+${lv}</span>
      <div class="desc">×${FORGE.mult} ${it ? nameHtml(it) : '<span class="dim">(empty slot)</span>'} stats per level</div>${lv ? `<div class="now">now ×${fmt(forgeMult(s))}</div>` : ''}</div>
      <button data-act="forge" data-id="${s}" ${G.gold < c ? 'disabled' : ''}>${fmt(c)}g</button></div>`;
  }).join('')}` };
};
// 🏅 achievements: a tab per category; unfinished ones first, closest to done at the top, then the earned ones
const achProgress = A => { if (G.ach[A.id]) return 1; if (!A.prog) return 0; const [c, t] = A.prog(G); return Math.max(0, Math.min(0.999, c / t)); };
PANELS.ach = () => {
  const tabs = Object.entries(ACH_CATS).map(([id, name]) => { const all = ACHIEVEMENTS.filter(A => A.cat === id); return [id, `${name} <span class="dim">${all.filter(A => G.ach[A.id]).length}/${all.length}</span>`]; });
  const cat = tabOf('ach', tabs), list = ACHIEVEMENTS.filter(A => A.cat === cat);
  const row = A => {
    const got = G.ach[A.id], cos = A.cos && cosmeticById(A.cos), p = !got && A.prog ? A.prog(G) : null;
    return `<div class="uprow ${got ? 'got' : ''}" title="${plain(A.desc)}"><span class="uicon">${got ? '🏅' : '▫'}</span><div class="grow"><b>${A.name}</b>${cos ? ` <span class="small ${got ? 'up' : 'dim'}" title="Unlocks ${plain(cos.name)} (${COSMETICS[cos.cat].name.toLowerCase()})">🎨</span>` : ''}<div class="desc">${A.desc}${cos ? ` · 🎨 ${cos.name}` : ''}</div>
      ${p ? `<div class="pbar"><i style="width:${achProgress(A) * 100}%"></i><span>${fmt(Math.min(p[0], p[1]))} / ${fmt(p[1])}</span></div>` : ''}</div>${got ? `<small class="dim">${new Date(got).toLocaleDateString()}</small>` : ''}</div>`;
  };
  const todo = list.filter(A => !G.ach[A.id]).sort((a, b) => achProgress(b) - achProgress(a)), done = list.filter(A => G.ach[A.id]).sort((a, b) => G.ach[b.id] - G.ach[a.id]);
  return { bar: backTab + tabBar('ach', tabs),
    body: `<div class="small"><b>${achCount()} / ${ACHIEVEMENTS.length}</b> · <span class="up">×${achMult().toFixed(2)} damage, health & gold</span> <span class="dim">(+${ACH_BONUS * 100}% each)</span></div>
  ${todo.map(row).join('')}${done.length ? `<div class="small wcat">Earned</div>${done.map(row).join('')}` : ''}` };
};
// 🎨 wardrobe: a tab per category; locked looks say which achievement gives them
const COS_ICONS = { dye: '🎨', helm: '⛑', cape: '🧣', weapon: '⚔', aura: '✨', pet: '🐾' };
PANELS.wardrobe = () => {
  const big = heroCanvas(false, 0).toDataURL();
  const tabs = Object.entries(COSMETICS).map(([cat, C]) => { const ids = Object.keys(C.items); return [cat, `${COS_ICONS[cat] || ''} ${C.name.split(' ')[0]} <span class="dim">${ids.filter(cosUnlocked).length}/${ids.length}</span>`]; });
  const cat = tabOf('wardrobe', tabs), C = COSMETICS[cat];
  return { bar: backTab + tabBar('wardrobe', tabs),
    body: `<div class="wtop"><img class="preview" src="${big}"><div class="wrow">${Object.entries(C.items).map(([id, it]) => {
    const own = cosUnlocked(id), on = G.cos[cat] === id, A = ACHIEVEMENTS.find(a => a.cos === id), fx = it.fx ? fxText(it.fx) : '';
    const how = `${A ? `${A.name} (${A.desc})` : ''}${cat === 'pet' ? `${A ? ' or ' : ''}a rare boss drop / 💎 summon` : ''}`;
    return own ? `<button class="sm ${on ? 'on' : ''}" data-act="wear" data-cat="${cat}" data-id="${id}" title="${plain(fx)}">${it.name}${fx ? ` <small class="up">${fx}</small>` : ''}</button>`
      : `<button class="sm" disabled title="Unlock: ${plain(how || '?')}${fx ? ' · ' + plain(fx) : ''}">🔒 ${it.name}</button>`;
  }).join('')}</div></div><div class="small dim">${cat === 'pet' ? 'Your pet gives its bonus while you wear it. Pets also come from rare boss drops or the 💎 shop.' : 'Cosmetic only.'} Hover a 🔒 look to see how to unlock it.</div>` };
};
// 💎 gems: skill training, relics, one-off buys and daily bounties
PANELS.gems = () => {
  const canRank = Object.keys(SKILLS).filter(k => G.seen['skill_' + k] && G.gems >= rankCost(k)).length;
  const canRelic = Object.keys(RELICS).filter(k => !hasRelic(k) && G.gems >= RELICS[k].cost).length;
  const B = G.bounty, left = B ? B.list.filter(b => !b.done).length : 0;
  const tabs = [['skills', `🌀 Skills${canRank ? ` <b class="cnt">${canRank}</b>` : ''}`], ['relics', `🔮 Relics${canRelic ? ` <b class="cnt">${canRelic}</b>` : ''}`], ['shop', '🛒 Shop'], ['daily', `📅 Daily${left ? ` <span class="dim">${3 - left}/3</span>` : B ? ' ✔' : ''}`]]
    .filter(([id]) => !(id === 'daily' && G.challenge));  // (🏁 challenge runs have no daily bounties)
  const head = `<div class="row"><span>Gems: <b class="gem">💎 ${fmt(G.gems)}</b></span><span class="dim small">permanent · never reset</span></div>`;
  const how = `<div class="small dim intro">Gems come from the first clear of each zone's last boss (every ${FLOORS_PER_ZONE} floors, more the deeper you go), every achievement (💎${GEMS.perAch}), daily bounties, bestiary milestones, a rare golden cookie and the odd treasure chest.</div>`;
  const tab = tabOf('gems', tabs);
  if (tab === 'shop') return { bar: backTab + tabBar('gems', tabs), body: head + Object.entries(GEM_SHOP).map(([k, S]) => {
    const off = k === 'reroll' && !G.amulet;
    return `<div class="uprow" title="${plain(S.desc)}"><span class="uicon">${S.icon}</span><div class="grow"><b>${S.name}</b><div class="desc">${S.desc}${off ? ' <span class="dim">(no amulet yet)</span>' : ''}</div></div><button class="gembtn" data-act="gemshop" data-id="${k}" ${G.gems < S.cost || off ? 'disabled' : ''}>💎${S.cost}</button></div>`;
  }).join('') };
  if (tab === 'daily') return { bar: backTab + tabBar('gems', tabs), body: head + (!B ? `<div class="small dim">Daily bounties unlock at floor ${BOUNTY_AT}.</div>` : B.list.map(b => {
    const T = BOUNTY_TYPES.find(t => t.id === b.type), p = Math.min(b.n, bountyProgress(b));
    return `<div class="uprow ${b.done ? 'got' : ''}"><span class="uicon">${b.done ? '✔' : '📅'}</span><div class="grow"><b>${T.text(b.n)}</b><div class="pbar"><i style="width:${p / b.n * 100}%"></i><span>${fmt(p)} / ${fmt(b.n)}</span></div></div><span class="gem small">💎${BOUNTY_REWARD.each}</span></div>`;
  }).join('') + `<div class="small ${B.bonus ? 'up' : 'dim'}">All three: +💎${BOUNTY_REWARD.all} bonus${B.bonus ? ' ✔' : ''} · new bounties every day</div>`) };
  if (tabOf('gems', tabs) === 'relics') return { bar: backTab + tabBar('gems', tabs), body: head + how + Object.entries(RELICS).map(([k, R]) => {
    const own = hasRelic(k);
    return `<div class="uprow ${own ? 'got' : ''}" title="${plain(R.desc)}"><span class="uicon">${R.icon}</span><div class="grow"><b>${R.name}</b>${own ? ' <span class="up small">owned</span>' : ''}<div class="desc">${R.desc}</div></div>${own ? '' : `<button class="gembtn" data-act="relic" data-id="${k}" ${G.gems < R.cost ? 'disabled' : ''}>💎${R.cost}</button>`}</div>`;
  }).join('') };
  const eff = k => ({ warcry: 'longer War Cry', fury: 'longer Battle Fury', bash: 'longer stuns' })[k] || 'damage';
  return { bar: backTab + tabBar('gems', tabs), body: head + how + Object.entries(SKILLS).map(([k, S]) => {
    const seen = G.seen['skill_' + k], r = skillRank(k), c = rankCost(k);
    if (!seen) return `<div class="uprow locked"><span class="uicon">🔒</span><div class="grow"><b>???</b> <span class="dim small">learn it first (level ${S.lvl})</span></div></div>`;
    const E = SKILL_EVO[k], per = r < 5 ? SKILL_RANKS.power : SKILL_RANKS.power2;
    return `<div class="uprow ${evolved(k) ? 'got' : ''}" title="Ranks 1–5: +${SKILL_RANKS.power * 100}% ${eff(k)} each · ranks 6–10: +${SKILL_RANKS.power2 * 100}% each · rank ${SKILL_RANKS.max}: evolves into ${plain(E.name)}"><span class="uicon">${S.icon}</span><div class="grow"><b style="color:${S.color}">${evolved(k) ? E.name : S.name}</b> <span class="dim">Rank ${r}/${SKILL_RANKS.max}</span>
      <div class="desc">${evolved(k) ? `✦ Evolved: ${E.desc}` : `+${per * 100}% ${eff(k)} next rank · at rank ${SKILL_RANKS.max}: <b>✦ ${E.name}</b> <span class="dim">(${E.desc})</span>`}</div>${r ? `<div class="now">now ×${skillPower(k).toFixed(2)} ${eff(k)}</div>` : ''}</div>${r >= SKILL_RANKS.max ? '<button disabled>MAX</button>' : `<button class="gembtn" data-act="rank" data-id="${k}" ${G.gems < c ? 'disabled' : ''}>💎${c}</button>`}</div>`;
  }).join('') };
};
// 📖 bestiary: a tab per zone (its monsters and both bosses) with kill milestones
const iconCache = new Map();
const spriteIcon = (name, pal) => { const k = name + JSON.stringify(pal || {}); if (!iconCache.has(k)) iconCache.set(k, spriteCanvas(name, pal, false, false).toDataURL()); return iconCache.get(k); };
PANELS.bestiary = () => {
  const seenZones = ZONES.map((z, i) => i).filter(i => G.bestFloor > i * FLOORS_PER_ZONE || i === 0);
  const zoneKeys = i => [...ZONES[i].mobs.map(m => ({ k: m, d: ENEMIES[m] })), { k: `boss:${i}:guard`, d: ZONES[i].guard, boss: 'Guardian' }, { k: `boss:${i}:lord`, d: ZONES[i].boss, boss: 'Lord' }];
  const tabs = seenZones.map(i => { const ks = zoneKeys(i), done = ks.filter(x => beastTier(x.k) >= (x.boss ? BESTIARY.bossTiers : BESTIARY.tiers).length).length; return [String(i), `${ZONES[i].name.replace(/^The /, '')} <span class="dim">${done}/${ks.length}</span>`]; });
  const zi = +tabOf('bestiary', tabs), total = Object.values(G.bestiary || {}).reduce((a, b) => a + b, 0);
  const rows = zoneKeys(zi).map(({ k, d, boss }) => {
    const kills = beastKills(k), T = boss ? BESTIARY.bossTiers : BESTIARY.tiers, t = beastTier(k), next = T[t];
    if (!kills) return `<div class="uprow locked"><span class="uicon">❔</span><div class="grow"><b>???</b> <span class="dim small">${boss ? boss + ' · ' : ''}not met yet</span></div></div>`;
    const bonus = Math.round((bestiaryMult(k) - 1) * 100), prev = T[t - 1] || 0;
    return `<div class="uprow"><img class="bicon" src="${spriteIcon(d.sprite, d.pal)}"><div class="grow"><b>${d.name}</b> <span class="dim small">${boss ? boss + ' · ' : ''}${fmt(kills)} defeated${bonus ? ` · <span class="up">+${bonus}% dmg</span>` : ''}</span>
      ${next ? `<div class="pbar"><i style="width:${(kills - prev) / (next - prev) * 100}%"></i><span>${fmt(kills)} / ${fmt(next)} → +${BESTIARY.dmg[t]}%${(boss ? BESTIARY.bossGems : BESTIARY.gems)[t] ? ` · 💎${(boss ? BESTIARY.bossGems : BESTIARY.gems)[t]}` : ''}</span></div>` : '<div class="small up">complete ✔</div>'}</div></div>`;
  }).join('');
  return { bar: backTab + tabBar('bestiary', tabs),
    body: `<div class="small dim intro">Every ${BESTIARY.tiers.map(fmt).join(' / ')} kills of a monster (${BESTIARY.bossTiers.join(' / ')} for bosses) permanently raise your damage against it. Later milestones pay gems.${hasRelic('tome') ? ' 📖 Monster Tome: bonuses doubled.' : ''}</div>
    <div class="small">${fmt(total)} kills recorded</div>${rows}` };
};
// 🏁 challenge runs & ☠ Boss Rush
PANELS.modes = () => {
  const nC = Object.keys(CHALLENGES).length, tabs = [];
  if (G.challenge) tabs.push(['chal', '🏁 Challenge']);
  else {
    if (featureOn('challenges')) tabs.push(['chal', `🏁 Challenges <span class="dim">${Object.keys(G.chal.done).length}/${nC}</span>`]);
    if (featureOn('rush')) tabs.push(['rush', `☠ Boss Rush${rushWait() <= 0 && !RT.rush ? ' <b class="cnt">!</b>' : ''}`]);
    const expDone = (G.exped || []).filter(e => Date.now() >= e.end).length, expFree = expSlots() - (G.exped || []).length;
    if (featureOn('exped')) tabs.push(['exped', `🐾 Expeditions${expDone ? ` <b class="cnt">${expDone}</b>` : expFree > 0 && petsOwned().some(p => !petAway(p)) ? ' <b class="cnt">+</b>' : ''}`]);
    if (featureOn('lab')) tabs.push(['lab', `🧪 Lab${G.lab.active.length < labSlots() && Object.keys(RESEARCH).some(k => !G.lab.done[k] && !researching(k) && G.insight >= RESEARCH[k].cost) ? ' <b class="cnt">+</b>' : ''}`]);
  }
  if (!tabs.length) return '<p class="dim small">Challenge runs open up after your first rebirth, the Boss Rush at floor ' + RUSH.at + '.</p>';
  const bar = tabBar('modes', tabs), t = tabOf('modes', tabs);
  if (t === 'exped') {
    const now = Date.now(), pets = petsOwned();
    const away = G.exped.map((e, i) => {
      const P = COSMETICS.pet.items[e.pet], E = EXPEDITIONS[e.kind], left = (e.end - now) / 1000, r = expRewards(e);
      return `<div class="uprow"><img class="bicon" src="${spriteIcon(P.sprite, P.pal)}"><div class="grow"><b>${P.name}</b> <span class="dim small">Lv ${petLvl(e.pet)} · ${E.icon} ${E.name}</span>
        <div class="pbar"><i style="width:${Math.min(100, (now - e.start) / (e.end - e.start) * 100)}%"></i><span>${left > 0 ? fmtTime(left) + ' left' : 'back!'}</span></div>
        <div class="desc">💎${r.gems} · 🔩${fmt(r.scrap)}${featureOn('lab') ? ` · 🧪${fmt(Math.round(r.insight * labMult('insight')))}` : ''}${r.dust ? ` · ✧${fmt(r.dust)}` : ''}${r.items ? ` · ${r.items} boss item${r.items > 1 ? 's' : ''}` : ''} · +${r.xp} pet xp</div></div>
        ${left <= 0 ? `<button class="gembtn" data-act="collectExp" data-id="${i}">Collect</button>` : ''}</div>`;
    }).join('');
    const free = expSlots() - G.exped.length;
    const home = pets.filter(p => !petAway(p)).map(p => {
      const P = COSMETICS.pet.items[p], lv = petLvl(p), xp = G.petXp[p] || 0, next = 2 * Math.pow(lv + 1, 2);
      return `<div class="uprow"><img class="bicon" src="${spriteIcon(P.sprite, P.pal)}"><div class="grow"><b>${P.name}</b> <span class="dim small">Lv ${lv}${lv < PET_MAX_LVL ? ` · ${xp}/${next} xp` : ' (max)'}${G.cos.pet === p ? ' · worn' : ''}</span>
        ${P.fx ? `<div class="desc">worn: ${fxText(Object.fromEntries(Object.entries(P.fx).map(([k, v]) => [k, +(v * (1 + 0.1 * lv)).toFixed(1)])))}</div>` : ''}</div>
        ${Object.entries(EXPEDITIONS).map(([k, E]) => `<button class="sm" data-act="sendExp" data-id="${p}" data-kind="${k}" ${free <= 0 ? 'disabled' : ''} title="${E.name}: ${fmtTime(E.secs)}">${E.icon} ${E.secs >= 3600 ? E.secs / 3600 + 'h' : E.secs / 60 + 'm'}</button>`).join('')}</div>`;
    }).join('');
    return { bar, body: `<div class="small dim intro">Send pets away for real time (it carries on while the game is closed). They come back with gems, scrap${featureOn('lab') ? ', Insight' : ''}${featureOn('stars') ? ', Stardust' : ''} and boss-quality items, and gain experience: each pet level makes its worn bonus +10% stronger and its trips +5% better. A pet that's away can't be worn.${hasLab('autoExp') ? ' 🕊 Homing Pigeons: finished trips collect themselves and go again.' : ''}</div>
      <div class="small">Slots: <b>${G.exped.length} / ${expSlots()}</b> in use</div>${away}
      ${pets.length ? `<div class="small wcat">At home</div>${home || '<div class="small dim">Every pet is out.</div>'}` : '<div class="small dim">You have no pets yet: bosses sometimes drop one, and the 💎 shop sells them.</div>'}` };
  }
  if (t === 'lab') {
    const L = G.lab, free = labSlots() - L.active.length;
    const active = L.active.map(a => { const R = RESEARCH[a.id], tot = R.hours * 3600; return `<div class="uprow"><span class="uicon">${R.icon}</span><div class="grow"><b>${R.name}</b><div class="desc">${R.desc}</div>
      <div class="pbar"><i style="width:${Math.min(100, a.prog / tot * 100)}%"></i><span>${fmtTime(Math.max(0, tot - a.prog))} left${eventFx('lab') > 1 ? ' (💡 ×2 speed)' : ''}</span></div></div><button class="sm" data-act="cancelResearch" data-id="${a.id}" title="Stop it and get the Insight back (the time spent is lost)">✕</button></div>`; }).join('');
    const todo = Object.entries(RESEARCH).filter(([k]) => !L.done[k] && !researching(k)).sort((a, b) => a[1].cost - b[1].cost).map(([k, R]) =>
      `<div class="uprow" title="${plain(R.desc)}"><span class="uicon">${R.icon}</span><div class="grow"><b>${R.name}</b> <span class="dim small">${fmtTime(R.hours * 3600)}</span><div class="desc">${R.desc}</div></div>
        <button class="gembtn" data-act="research" data-id="${k}" ${free <= 0 || G.insight < R.cost ? 'disabled' : ''}>🧪${R.cost}</button></div>`).join('');
    const done = Object.keys(L.done).filter(k => RESEARCH[k]);
    return { bar, body: `<div class="row"><span>Insight: <b class="ins">🧪 ${fmt(G.insight || 0)}</b></span><span class="dim small">${L.active.length}/${labSlots()} researching · ${done.length}/${Object.keys(RESEARCH).length} done</span></div>
      <div class="small dim intro">Research takes real time (it carries on while the game is closed) and is permanent. Insight comes from every boss floor you beat for the first time (more each lap), new Boss Rush records and expeditions.</div>
      ${active}${todo}${done.length ? `<div class="small wcat">Done</div><div class="small up">${done.map(k => `${RESEARCH[k].icon} ${RESEARCH[k].name}`).join(' · ')}</div>` : ''}` };
  }
  if (t === 'rush') {
    const R = RT.rush, wait = rushWait(), N = RUSH_LIST.length;
    const intro = `<div class="small dim intro">Fight all ${N} bosses (every zone's Guardian and Lord) back to back. The first is as strong as floor ${rushFloor(0)} (${G.stats.rushFloor ? 'the toughest boss you\'ve beaten in a Boss Rush, so each rush picks up at your record' : 'your deepest floor this run, until you set a Boss Rush record'}), each next one ${rushStep()} floors deeper (the last: floor ${rushFloor(N - 1)}). You catch your breath between bosses; dying or running out of time ends the rush. Only the bosses' item drops count, at the item level of their floor: no gold, XP, souls, gems or amulets. Once every ${RUSH.cooldown / 60} minutes.</div>`;
    const now = R ? `<div class="uprow"><span class="uicon">☠</span><div class="grow"><b>Boss ${R.k + 1} / ${N}: ${R.kind === 'guard' ? ZONES[R.zi].guard.name : ZONES[R.zi].boss.name}</b> <span class="dim small">floor ${R.f}</span>
        <div class="pbar"><i style="width:${R.kills / N * 100}%"></i><span>${R.kills} defeated · ${R.items} items</span></div></div>
        ${ui.confirm === 'quitRush' ? `<button class="danger" data-act="quitRush">Give up?</button><button data-act="cancel">No</button>` : `<button data-act="askQuitRush">Give up</button>`}</div>`
      : wait > 0 ? `<button disabled>☠ Ready in ${fmtTime(wait)}</button>` : `<button class="danger" data-act="startRush">☠ Start the Boss Rush</button>`;
    const auto = hasLab('autoRush') ? `<label class="set" title="Rush Drill research: starts a Boss Rush by itself whenever the cooldown is over (not in the middle of a boss fight)"><input type="checkbox" data-act="toggle" data-id="autoRush" ${G.settings.autoRush ? 'checked' : ''}> ☠ Start a Boss Rush by itself when it's ready</label>` : '';
    return { bar, body: `${intro}${auto}${now}<div class="small">Best:<b>${G.stats.rushBest || 0} / ${N}</b> bosses${G.stats.rushFloor ? ` · toughest beaten: floor ${G.stats.rushFloor}` : ''} ·${G.stats.rushes || 0} rush${(G.stats.rushes || 0) === 1 ? '' : 'es'} so far</div>` };
  }
  const C = chalDef();
  if (C) {
    const left = C.fx.time ? Math.max(0, C.fx.time - G.stats.time) : 0;
    return { bar, body: `<div class="uprow"><span class="uicon">${C.icon}</span><div class="grow"><b>${C.name}</b><div class="desc">${C.rule}</div>
      <div class="pbar"><i style="width:${Math.min(1, G.bestFloor / C.goal) * 100}%"></i><span>floor ${G.bestFloor} / ${C.goal}</span></div>
      ${C.fx.time ? `<div class="small">⏱ ${fmtTime(left)} of play left</div>` : ''}<div class="now">reward: ${chalRewardText(C)} on your save, for good</div></div></div>
      <div class="small dim">A fresh game, apart from your save: your save waits, untouched, until you reach the goal or back out. No rebirths, achievements or bounties in here, and it pauses while the game is closed. 💪 Grit: stuck for more than ${GRIT.after / 60} minutes without a new floor, you get +${GRIT.per * 100}% damage & health for every further minute (up to +${GRIT.per * GRIT.max * 100}%), until your next new floor.</div>
      ${ui.confirm === 'leaveChal' ? `<div class="warn">Back out? This run is lost (your best floor is remembered). <button class="danger" data-act="leaveChal">Back out</button> <button data-act="cancel">Stay</button></div>` : `<button data-act="askLeaveChal">↩ Back out to my save</button>`}` };
  }
  const got = Object.keys(G.chal.done).map(id => CHALLENGES[id]).filter(Boolean);
  return { bar, body: `<div class="small dim intro">Each challenge is a fresh game with one rule, apart from your save (which waits untouched). Reach the goal floor to win a permanent bonus for your save. You can back out at any time.</div>
    ${got.length ? `<div class="small">Active rewards: <span class="up">${got.map(chalRewardText).join(' · ')}</span></div>` : ''}
    ${Object.entries(CHALLENGES).map(([id, X]) => {
      const done = G.chal.done[id], best = G.chal.best[id];
      return `<div class="uprow ${done ? 'got' : ''}" title="${plain(X.rule)}"><span class="uicon">${X.icon}</span><div class="grow"><b>${X.name}</b> ${done ? '<span class="up small">✔ beaten</span>' : best ? `<span class="dim small">best floor ${best}</span>` : ''}
        <div class="desc">${X.rule}. Goal: reach floor ${X.goal}</div><div class="now">${chalRewardText(X)}${done ? ' (active)' : ', for good'}</div></div>
        ${done ? '' : ui.confirm === 'chal:' + id ? `<button class="danger" data-act="startChal" data-id="${id}">Start?</button><button data-act="cancel">No</button>` : `<button data-act="askChal" data-id="${id}">Start</button>`}</div>`;
    }).join('')}` };
};
// 📊 stats & history
PANELS.stats = () => {
  const S = G.stats, runT = Math.max(0, S.time - (G.runStart || 0)), b = S.bestItem;
  const rate = floorsPerMin();
  const tabs = [['run', 'This run'], ['all', 'All time'], ['hist', `Past runs${G.history.length ? ` <span class="dim">${G.history.length}</span>` : ''}`]], t = tabOf('stats', tabs);
  if (t === 'hist') return { bar: backTab + tabBar('stats', tabs),
    body: G.history.length ? `<table class="odds-t"><tr><th>#</th><th>Floor</th><th>Time</th><th>Souls</th></tr>
    ${G.history.slice(0, 30).map(h => `<tr><td>${h.n}</td><td>${h.floor}</td><td>${h.secs ? fmtTime(h.secs) : '—'}</td><td class="soul">+${fmt(h.souls)}</td></tr>`).join('')}</table>` : '<div class="small dim">No rebirths yet.</div>' };
  if (t === 'run') return { bar: backTab + tabBar('stats', tabs), body: `<table class="odds-t stat-t">
  <tr><td>Run</td><td>#${G.rebirths + 1}</td></tr>
  <tr><td>Time</td><td>${fmtTime(runT)}</td></tr>
  <tr><td>Floor</td><td>${G.floor} (deepest ${G.maxFloor}) · lap ${roman(zoneTier(G.floor) + 1)}</td></tr>
  <tr><td>Pace</td><td>${rate == null ? '<span class="dim">measuring…</span>' : `${rate.toFixed(1)} floors/min <span class="dim">(last 5 min)</span>`}</td></tr>
  <tr><td>Income</td><td>${fmt(G.rates.gold)} gold/s · ${fmt(G.rates.xp)} XP/s</td></tr></table>` };
  return { bar: backTab + tabBar('stats', tabs), body: `<table class="odds-t stat-t">
  <tr><td>Best floor</td><td>${G.bestFloor} · lap ${roman(zoneTier(G.bestFloor) + 1)} (${zoneTier(G.bestFloor)} lap${zoneTier(G.bestFloor) === 1 ? '' : 's'} done, ${FLOORS_PER_ZONE * ZONES.length} floors each)</td></tr>
  <tr><td>Played</td><td>${fmtTime(S.time)}</td></tr>
  <tr><td>Kills</td><td>${fmt(S.kills)} · ${fmt(S.bossKills)} bosses</td></tr>
  <tr><td>Items</td><td>${fmt(S.items)} found · ${fmt(S.equipped)} equipped</td></tr>
  <tr><td>Amulets</td><td>${fmt(S.amulets || 0)} found</td></tr>
  <tr><td>Gold earned</td><td>${fmt(S.gold)}</td></tr>
  <tr><td>Cookies · chests</td><td>${fmt(S.cookies || 0)} · ${fmt(S.chests || 0)}</td></tr>
  <tr><td>Highest level</td><td>${S.maxLvl || G.hero.lvl}</td></tr>
  <tr><td>Rebirths</td><td>${G.rebirths} · ${fmt(S.soulsEarned || 0)} souls earned</td></tr>
  <tr><td>Crits · dodges</td><td>${fmt(S.crits || 0)} · ${fmt(S.dodges || 0)}</td></tr>
  <tr><td>Falls</td><td>${fmt(S.deaths || 0)}</td></tr>
  <tr><td>Gems</td><td>${fmt(S.gemsEarned || 0)} earned · ${fmt(G.gems)} to spend</td></tr>
  </table>
  ${b ? `<div class="small wcat">🎲 Rarest item ever found</div>${itemHtml(b, `<div class="findinfo">Floor ${b.foundFloor}${b.foundAt ? ' · ' + new Date(b.foundAt).toLocaleDateString() : ''}</div>`)}` : ''}` };
};
// floors per minute over the last 5 minutes of play (sampled every 10s, not saved)
const paceSamples = [];
function samplePace() {
  paceSamples.push([G.stats.time, G.maxFloor]);
  while (paceSamples.length && G.stats.time - paceSamples[0][0] > 300) paceSamples.shift();
}
function floorsPerMin() {
  if (paceSamples.length < 3) return null;
  const [t0, f0] = paceSamples[0], [t1, f1] = paceSamples[paceSamples.length - 1];
  return t1 > t0 ? Math.max(0, f1 - f0) / ((t1 - t0) / 60) : null;
}
PANELS.settings = () => {
  const S = G.settings, api = !!Bridge.api;
  const tabs = [['window', '🪟 Window'], ['sound', '🔊 Sound & numbers'], ['popups', '🔔 Popups'], ['saves', '💾 Saves']], t = tabOf('settings', tabs);
  const chk = (id, label, title = '') => `<label class="set" title="${title}"><input type="checkbox" data-act="toggle" data-id="${id}" ${S[id] ? 'checked' : ''}> ${label}</label>`;
  const sel = (key, opts) => `<select data-set="${key}">${opts.map(([v, l]) => `<option value="${v}" ${S[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const bodies = {
    window: () => api ? `<label class="set"><input type="checkbox" data-act="setOnTop" ${S.onTop ? 'checked' : ''}> Always on top</label>
      <div class="set">Size: ${['small', 'medium', 'large'].map(z => `<button class="sm ${S.size === z ? 'on' : ''}" data-act="size" data-id="${z}">${z}</button>`).join(' ')}</div>
      <div class="set">Snap to corner: ${[['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']].map(([c, i]) => `<button class="sm ${(S.corner || 'br') === c ? 'on' : ''}" data-act="corner" data-id="${c}">${i}</button>`).join(' ')}</div>
      <div class="set">When the mouse is away, fade to ${sel('fade', [[100, 'off'], [80, '80%'], [60, '60%'], [40, '40%'], [25, '25%']])}</div>
      ${chk('clickThrough', '…and let clicks pass through while faded', 'Clicks go to whatever is behind the game until you move the mouse over it')}
      <div class="small dim">▭ in the title bar cycles normal → compact → mini (just the floor, health and gold).</div>`
      : '<p class="dim small">Running in a browser. Launch with PocketDelve.pyw for the always-on-top window and its window options.</p>',
    sound: () => `${chk('sound', 'Sound effects (rare drops, bosses, achievements, gems)')}
      <div class="set">Volume ${sel('volume', [[0.25, 'quiet'], [0.5, 'medium'], [1, 'loud']])}</div>
      ${chk('sci', 'Scientific numbers (1.23e15 instead of 1.23Qa)')}
      <button class="sm" data-panel="stats">📊 Stats & history</button>`,
    popups: () => `<div class="autobox"><b class="small">Loot</b>
      <div class="set">Equipped: ${raritySelect('nEqR', S.nEqR)}</div>
      ${chk('nEqMod', '…or has any modifier (Shiny, Keen…)')}
      <div class="set">Sold: ${raritySelect('nSoldR', S.nSoldR)}</div>
      ${chk('nSoldMod', '…or has a rare modifier (Glowing+ or two modifiers)')}</div>
      <div class="autobox"><b class="small">Other popups</b> <span class="dim small">(everything still goes in 🛡 Hero → 📜 Log)</span>
      ${Object.entries(TOAST_CATS).map(([k, l]) => `<label class="set"><input type="checkbox" data-act="mute" data-id="${k}" ${S.mute && S.mute[k] ? '' : 'checked'}> ${l}</label>`).join('')}</div>`,
    saves: () => `${api ? `<div class="set"><button class="sm" data-act="backupNow">💾 Back up now</button> <button class="sm" data-act="openBackups">📂 Open folder</button></div>
      <div class="small dim">Backups are also made automatically at start and every 30 minutes (the last 10 are kept).</div>
      ${(ui.backups || []).slice(0, 15).map(b => `<div class="uprow"><div class="grow small">${b.name.startsWith('manual') ? '💾' : '🕒'} ${new Date(b.time * 1000).toLocaleString()} <span class="dim">${Math.round(b.size / 1024)} KB</span></div>
        ${ui.confirm === 'restore:' + b.name ? `<button class="danger" data-act="doRestore" data-id="${b.name}">Restore?</button><button data-act="cancel">No</button>` : `<button class="sm" data-act="askRestore" data-id="${b.name}">Restore</button>`}</div>`).join('') || '<div class="small dim">No backups yet.</div>'}` : '<p class="dim small">Backups need the desktop app.</p>'}
      ${ui.confirm === 'reset' ? `<div class="warn">Delete all progress? <button class="danger" data-act="doReset">Yes, reset</button> <button data-act="cancel">Cancel</button></div>` : `<button class="sm danger" data-act="askReset">Reset save</button>`}`,
  };
  if (t === 'saves' && api && !ui.backups) loadBackups();
  return { bar: tabBar('settings', tabs), body: bodies[t]() };
};
// ---- panel tabs: a bar under the panel title that stays put while the content scrolls ----
// tabs = [[id, label], ...]; the picked tab is remembered per panel (in settings, so it survives restarts)
const tabStore = () => G.settings.tabs || (G.settings.tabs = {});
const tabOf = (key, tabs) => tabs.some(t => t[0] === tabStore()[key]) ? tabStore()[key] : tabs[0][0];
const tabBar = (key, tabs, extra = '') => tabs.map(([id, label]) => `<button class="tab ${id === tabOf(key, tabs) ? 'on' : ''}" data-act="tab" data-key="${key}" data-id="${id}">${label}</button>`).join('') + extra;
const backTab = `<button class="tab" data-panel="hero" title="Back to Hero">←</button>`;
const plain = html => String(html).replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');
// small windows: one-line rows (descriptions hidden, shown as tooltips) unless ⓘ details is on
const isTight = () => document.body.classList.contains('tight');
function renderPanel() {
  ui.dirty = false; ui.lastRender = performance.now();
  const p = $('#panel');
  document.body.classList.toggle('panel-open', !!ui.panel);
  if (!ui.panel) { p.hidden = true; return; }
  p.hidden = false;
  const titles = { hero: '🛡 Hero', finds: '🏆 Rare Finds', upg: '⬆ Upgrades', forge: '⚒ Forge', rebirth: '✦ Rebirth', settings: '⚙ Settings', ach: '🏅 Achievements', wardrobe: '🎨 Wardrobe', stats: '📊 Stats', gems: '💎 Gems', bestiary: '📖 Bestiary', modes: '🏁 Adventures' };
  const out = PANELS[ui.panel](), bar = typeof out === 'object' ? out.bar : '', html = typeof out === 'object' ? out.body : out;
  // scroll position is kept per panel + tab
  const key = ui.panel + ':' + (tabStore()[ui.panel] || ''), body = p.querySelector('.pbody');
  ui.scroll = ui.scroll || {};
  if (body && ui.scrollKey) ui.scroll[ui.scrollKey] = body.scrollTop;
  const open = [...p.querySelectorAll('details')].map(d => d.open);  // keep sections expanded across refreshes
  const info = isTight() ? `<button class="sm ${G.settings.details ? 'on' : ''}" data-act="details" title="Show descriptions">ⓘ</button>` : '';
  // small windows with tabs: no separate title row, the tab bar carries ⓘ and ✕ (the ⬆/🛡 button shows which panel it is)
  // keep the tab bar's sideways scroll across refreshes (the panel re-renders while the game runs)
  const oldTb = p.querySelector('.ptabs'); ui.tabsX = ui.tabsX || {};
  if (oldTb && ui.tabsPanel) ui.tabsX[ui.tabsPanel] = oldTb.scrollLeft;
  ui.tabsPanel = ui.panel;
  const merged = bar && isTight();
  p.innerHTML = `${merged ? '' : `<div class="phead"><b>${titles[ui.panel]}</b><span class="phbtns">${info}<button class="sm" data-act="closePanel">✕</button></span></div>`}${bar ? `<div class="ptabs">${bar}${merged ? `<span class="tabsep"></span><span class="phbtns pclose">${info}<button class="sm" data-act="closePanel" title="Close (Esc)">✕</button></span>` : ''}</div>` : ''}<div class="pbody">${html}</div>`;
  const tb = p.querySelector('.ptabs');
  if (tb) {
    tb.scrollLeft = ui.tabsX[ui.panel] || 0;
    // just opened or switched tab: make sure the active tab is in view
    const on = tb.querySelector('.tab.on');
    if (ui.tabJump && on && (on.offsetLeft < tb.scrollLeft || on.offsetLeft + on.offsetWidth > tb.scrollLeft + tb.clientWidth - 50)) tb.scrollLeft = Math.max(0, on.offsetLeft - 24);
    ui.tabJump = false;
    tb.addEventListener('wheel', e => { if (tb.scrollWidth > tb.clientWidth) { e.preventDefault(); tb.scrollLeft += e.deltaY || e.deltaX; } }, { passive: false });
  }
  // same panel re-rendering: restore each section exactly (so a section that starts open can stay closed)
  const same = ui.rendered === key; ui.rendered = key;
  p.querySelectorAll('details').forEach((d, i) => { if (same && i < open.length) d.open = open[i]; else if (open[i]) d.open = true; });
  p.querySelector('.pbody').scrollTop = ui.scroll[key] || 0; ui.scrollKey = key;
}
function openPanel(name) {
  ui.panel = ui.panel === name ? null : name; ui.confirm = null; ui.tabJump = true; autoRefViewCheck();
  document.querySelectorAll('button[data-panel]').forEach(b => b.classList.toggle('on', b.dataset.panel === ui.panel));
  if (ui.panel && viewMode() !== 'normal') setView('normal', true);
  renderPanel();
  setTimeout(resize, 0);  // the footer hides behind open panels in small windows
}

// ---------------- window controls ----------------
const SIZES = { small: [270, 140], medium: [300, 165], large: [430, 200] };
const isFullscreen = () => document.body.classList.contains('fs');
async function toggleFullscreen() {
  let on;
  if (Bridge.api) on = await Bridge.call('toggle_fullscreen');
  else { // plain browser fallback
    if (document.fullscreenElement) { await document.exitFullscreen(); on = false; }
    else { await document.documentElement.requestFullscreen(); on = true; }
  }
  document.body.classList.toggle('fs', !!on);
  if (on) document.body.classList.remove('compact', 'mini');
  else if (G.settings.mini) setView('mini');
  else if (G.settings.compact) document.body.classList.add('compact');
  $('#fsBtn').title = on ? 'Exit full screen (Esc)' : 'Full screen (Esc to exit)';
  setTimeout(resize, 80);
}
// window modes: normal, compact (no footer, shorter) and mini (a one-line strip: floor, health, gold)
const MINI_SIZE = [230, 30];
const viewMode = () => document.body.classList.contains('mini') ? 'mini' : document.body.classList.contains('compact') ? 'compact' : 'normal';
function setView(mode, temp) {
  if (isFullscreen()) return;
  const was = viewMode();
  document.body.classList.toggle('compact', mode === 'compact');
  document.body.classList.toggle('mini', mode === 'mini');
  if (!temp) { G.settings.compact = mode === 'compact'; G.settings.mini = mode === 'mini'; }
  const [w, h] = SIZES[G.settings.size] || SIZES.medium;
  if (mode === 'mini') Bridge.call('resize', MINI_SIZE[0], MINI_SIZE[1]);
  else Bridge.call('resize', was === 'mini' ? w : Math.round(window.innerWidth), mode === 'compact' ? Math.round(h * 0.62) : h);
  setTimeout(resize, 60);
}
const setCompact = (on, temp) => setView(on ? 'compact' : 'normal', temp);

const ACTIONS = {
  closePanel: () => openPanel(ui.panel),
  perk: d => buyPerkBulk(d.id),
  perkBuyMode: d => { G.settings.perkBuyMode = d.id === 'max' ? 'max' : +d.id; },
  upg: d => buyUpgradeBulk(d.id),
  skill: (d, el) => { if (G.skills[d.id]) G.skills[d.id].on = el.checked; },
  toggle: (d, el) => { G.settings[d.id] = el.checked; if (d.id === 'clickThrough') applyFade(); if (d.id === 'autoTemper' && el.checked) autoTemperStash(); if (d.id === 'sound' && el.checked) sfx('ach'); if (el.checked) automation(); },
  askRebirth: () => { ui.confirm = 'rebirth'; },
  star: d => buyStar(d.id),
  askAwaken: () => { ui.confirm = 'awaken'; },
  doAwaken: () => awaken(),
  doRebirth: () => rebirth(),
  askReset: () => { ui.confirm = 'reset'; },
  doReset: () => { resetting = true; Bridge.save(''); try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.reload(); },
  cancel: () => { ui.confirm = null; },
  setOnTop: (d, el) => { G.settings.onTop = el.checked; Bridge.call('set_on_top', el.checked); },
  fullscreen: () => toggleFullscreen(),
  size: d => { if (isFullscreen() || viewMode() === 'mini') return; G.settings.size = d.id; const [w, h] = SIZES[d.id]; Bridge.call('resize', w, document.body.classList.contains('compact') ? Math.round(h * 0.62) : h); setTimeout(resize, 60); },
  snap: () => Bridge.call('snap'),
  forge: d => reinforce(d.id),
  push: () => { G.farm = !G.farm; G.farmT = 0; },
  speed: () => { G.settings.speed3 = !G.settings.speed3; },
  compact: () => { if (ui.panel) openPanel(ui.panel); setView({ normal: 'compact', compact: 'mini', mini: 'normal' }[viewMode()]); },
  wear: d => { if (d.cat === 'pet' && petAway(d.id)) return toast('🐾 That pet is away on an expedition', '#ffb3e6'); G.cos[d.cat] = d.id; heroIconUrl = null; if (d.cat === 'pet') dirtyStats(); },
  tab: d => { tabStore()[d.key] = d.id; ui.tabJump = true; autoRefViewCheck(); },
  rank: d => buySkillRank(d.id),
  relic: d => buyRelic(d.id),
  gemshop: d => gemShop(d.id),
  reforge: d => reforge(d.id),
  reforgeKeep: d => reforgeChoose(d.id, true),
  autoReforge: (d, el) => setAutoReforge(d.id, el.checked),
  reforgeRevert: d => reforgeChoose(d.id, false),
  temper: d => temper(d.id),
  stashEquip: d => equipFromStash(+d.id),
  stashTemper: d => { temperItem(stashItem(+d.id)); autoEquipStash(); },  // (a tempered item may now beat what you wear)
  stashSell: d => { sellFromStash(+d.id); ui.confirm = null; },
  stashSlot: d => { G.settings.stashSlot = d.id; },
  askSellShown: () => { ui.confirm = 'sellShown'; },
  stashSellShown: () => { for (const id of ui.stashShown || []) sellFromStash(id); ui.confirm = null; },  // (skips 🔒 locked items)
  askSell: d => { ui.confirm = 'sell:' + d.id; },
  stashLock: d => { const it = stashItem(+d.id); if (it) { it.locked = !it.locked; if (ui.confirm === 'sell:' + d.id) ui.confirm = null; } },
  keepR: d => { const k = G.settings.keepR || (G.settings.keepR = {}); if (k[d.id]) delete k[d.id]; else k[d.id] = true; },
  scrapChest: d => buyScrapChest(d.id),
  askChal: d => { ui.confirm = 'chal:' + d.id; },
  startChal: d => startChallenge(d.id),
  askLeaveChal: () => { ui.confirm = 'leaveChal'; },
  leaveChal: () => leaveChallenge(false),
  startRush: () => startRush(),
  sendExp: d => sendExpedition(d.id, d.kind),
  collectExp: d => collectExpedition(+d.id),
  research: d => startResearch(d.id),
  cancelResearch: d => cancelResearch(d.id),
  swear: d => swearOath(d.id),
  askQuitRush: () => { ui.confirm = 'quitRush'; },
  quitRush: () => { ui.confirm = null; endRush('You gave up'); },
  autoSkip: d => { const s = G.settings.autoSkip || (G.settings.autoSkip = {}); if (s[d.id]) delete s[d.id]; else s[d.id] = true; },
  buyMode: d => { G.settings.buyMode = d.id === 'max' ? 'max' : +d.id; },
  mute: (d, el) => { G.settings.mute[d.id] = !el.checked; },
  corner: d => { G.settings.corner = d.id; Bridge.call('snap', d.id); },
  fade: () => applyFade(),
  backupNow: () => { Bridge.call('backup', saveData(), 'manual'); toast('💾 Backup saved', '#7df9ff'); setTimeout(loadBackups, 400); },
  openBackups: () => Bridge.call('open_backups'),
  askRestore: d => { ui.confirm = 'restore:' + d.id; },
  doRestore: d => restoreBackup(d.id),
  details: () => { G.settings.details = !G.settings.details; document.body.classList.toggle('details', G.settings.details); },
  min: () => { goAway(); Bridge.call('minimize'); },
  close: () => { save(); setTimeout(() => Bridge.call('close'), 150); },
  closeModal: () => { $('#modal').hidden = true; },
};

// ============================================================
//  Boot & loops
// ============================================================
// ⏩ 3× speed (from lap 3): the whole game (fights, walking, timers, cookies, chests) runs faster; offline progress
// and real-time things (Boss Rush cooldown, daily bounties) don't change
// ⏩ 3× speed only works on floors you're replaying (below your best): reaching new ground drops back to 1× and hides the
// button; the choice is remembered, so the next replay (e.g. after a rebirth) runs at 3× again
const speedAvail = () => featureOn('speed') && replaying();
const gameSpeed = () => G.settings.speed3 && speedAvail() ? 3 : 1;
function simulate(seconds, dt = 0.05) { const n = Math.floor(seconds / dt); for (let i = 0; i < n; i++) { tickBattle(dt); G.stats.time += dt; if (simFast && RT.cookie) eatCookie(); } }
// the ✕ sits outside the box so it stays reachable even when a small window cuts the box off
function showModal(html) { if (simFast) return; const m = $('#modal'); m.innerHTML = `<button class="mclose" data-act="closeModal" title="Close (Esc)">✕</button><div class="mbox">${html}</div>`; m.hidden = false; }
// ---- 🌙 minimized / hidden: stay on the current floor and farm it, then pick up where you were ----
function goAway() {
  if (ui.away) return;
  ui.away = { farm: G.farm, floor: G.floor, gold: G.stats.gold, kills: G.stats.kills, t: G.stats.time };
  G.farm = true; G.farmT = 0; ui.dirty = true;
}
function comeBack() {
  const a = ui.away; if (!a) return;
  ui.away = null;
  G.farm = a.farm; G.farmT = 0; G.stuckT = 0; ui.dirty = true;
  const secs = G.stats.time - a.t;
  if (secs > 20) toast(`🌙 While minimized you farmed floor ${G.floor} for ${fmtTime(secs)}: +${fmt(G.stats.gold - a.gold)} gold, ${fmt(G.stats.kills - a.kills)} kills`, '#b3c7ff');
}
// ---- 💾 backups (desktop app only): automatic every 30 min + at start, manual from Settings ----
function loadBackups() {
  const p = Bridge.call('list_backups');
  if (p && p.then) p.then(list => { ui.backups = list || []; ui.dirty = true; }).catch(() => { });
}
function restoreBackup(name) {
  const p = Bridge.call('read_backup', name);
  if (!p || !p.then) return;
  p.then(raw => {
    if (!raw) return toast('Could not read that backup', '#ff6b6b');
    resetting = true; Bridge.save(raw); setTimeout(() => location.reload(), 300);
  });
}
// 🪟 fade (and optionally let clicks pass through) while the mouse isn't over the window
const applyFade = () => Bridge.call('set_fade', G.settings.fade || 100, !!G.settings.clickThrough);
// ---- recap ----
// the snapshot is refreshed while the mouse is over the window; a recap compares against it
function takeSnap() {
  recap.snap = { t: G.stats.time, floor: G.floor, max: G.maxFloor, best: G.bestFloor, gold: G.stats.gold, kills: G.stats.kills, bosses: G.stats.bossKills,
    eq: G.stats.equipped, lvl: G.hero.lvl, rb: G.rebirths, am: G.stats.amulets || 0, ach: achCount(), souls: G.souls, gems: G.stats.gemsEarned || 0 };
  recap.best = null;
  if (!recap.lastSeen) recap.lastSeen = G.stats.time;
}
function showRecap() {
  const s = recap.snap, dt = G.stats.time - s.t, rb = G.rebirths - s.rb;
  const line = (icon, text) => `<div>${icon} ${text}</div>`;
  showModal(`<b>While you were busy</b> <span class="dim">(${fmtTime(dt)})</span>
    ${line('🏰', rb ? `Floor ${s.floor} → ${G.floor} · ${rb} rebirth${rb > 1 ? 's' : ''}` : `Floor ${s.floor} → ${G.floor}${G.bestFloor > s.best ? ` <span class="up">(new best!)</span>` : ''}`)}
    ${line('💰', `+${fmt(G.stats.gold - s.gold)} gold`)}
    ${line('⚔', `${fmt(G.stats.kills - s.kills)} kills · ${fmt(G.stats.bossKills - s.bosses)} bosses`)}
    ${line('📈', `${rb ? `Level ${G.hero.lvl}` : `Level ${s.lvl} → ${G.hero.lvl}`} · ${G.stats.equipped - s.eq} gear upgrades`)}
    ${rb ? line('✦', `${fmt(G.souls - s.souls)} souls banked`) : ''}
    ${(G.stats.amulets || 0) > s.am ? line('📿', `${G.stats.amulets - s.am} amulet${G.stats.amulets - s.am > 1 ? 's' : ''} found`) : ''}
    ${(G.stats.gemsEarned || 0) > s.gems ? line('💎', `+${fmt(G.stats.gemsEarned - s.gems)} gems`) : ''}
    ${achCount() > s.ach ? line('🏅', `${achCount() - s.ach} new achievement${achCount() - s.ach > 1 ? 's' : ''}`) : ''}
    ${recap.best ? line('🎲', `Best find: ${nameHtml(recap.best)}`) : ''}
    <button data-act="closeModal">Continue</button>`);
  takeSnap();
}
async function boot() {
  cv = $('#scene'); ctx = cv.getContext('2d');
  await Bridge.init();
  document.body.classList.toggle('app', !!Bridge.api);
  const had = applyLoaded(await Bridge.load());
  initRun();
  resize(); addEventListener('resize', resize);
  if (G.settings.mini) setView('mini');
  else if (G.settings.compact) document.body.classList.add('compact');
  if (had) {
    const away = (Date.now() - G.lastSave) / 1000;
    if (away > 0) labTick(away);  // 🧪 research carries on while the game is closed
    if (away > 60 && G.rates.gold > 0 && !G.challenge) {  // (a challenge run doesn't progress while closed)
      // ⏳ Hourglass: +25% efficiency and a 24h cap
      const eff = offlineEff(), capH = hasRelic('hourglass') ? 24 : 12;
      const r = offline(Math.min(away, capH * 3600), eff);
      showModal(`<b>While you were away</b> <span class="dim">(${fmtTime(away)}${away > capH * 3600 ? `, capped at ${capH}h` : ''})</span>
        <div>💰 +${fmt(r.gold)} gold</div><div>✦ +${fmt(r.xp)} XP${r.lvUps ? ` (${r.lvUps} level-ups)` : ''}</div><div>🎒 ${r.items} item${r.items === 1 ? '' : 's'} found, ${r.equipped} equipped</div>
        ${r.best ? `<div>🎲 Best find: ${nameHtml(r.best)}</div>` : ''}
        <div class="dim small">Offline efficiency ${Math.round(eff * 100)}%</div><button data-act="closeModal">Continue</button>`);
    }
    if (G.pendingNote) { toast(G.pendingNote, '#b388ff'); addLog(G.pendingNote); delete G.pendingNote; }
    if (G.pendingNote2) { toast(G.pendingNote2, '#6fe3ff'); addLog(G.pendingNote2); delete G.pendingNote2; }
    const P3 = (MAIN || G).pendingNote3; if (P3) { toast(P3, '#e1bee7'); addLog(P3); delete (MAIN || G).pendingNote3; }
    const P4 = (MAIN || G).pendingNote4; if (P4) { toast(P4, '#80deea'); addLog(P4); delete (MAIN || G).pendingNote4; }
    const P5 = (MAIN || G).pendingNote5; if (P5) { toast(P5, '#ffb74d'); addLog(P5); delete (MAIN || G).pendingNote5; }
    if (G.pendingAch) { const m = `🏅 ${G.pendingAch} achievements earned from your progress so far (+${G.pendingAch * ACH_BONUS * 100}% damage, health & gold). See 🛡 Hero → 🏅`; toast(m, '#ffcf40'); addLog(m); delete G.pendingAch; }
  } else toast('Welcome to Pocket Delve! Your warrior is heading in…', '#7df9ff');
  // "while you were busy" recap: shown when the mouse comes back over the window after a while
  takeSnap();
  document.addEventListener('pointermove', () => {
    if (viewMode() === 'mini') return;  // no room to show it; keep the snapshot for later
    const now = G.stats.time;
    if (recap.snap && now - recap.lastSeen > RECAP_AFTER && $('#modal').hidden && !isFullscreen()) showRecap();
    if (now - recap.lastSeen > 1) { recap.lastSeen = now; takeSnap(); }
  });
  // input
  document.addEventListener('pointerdown', () => { ui.pointerDown = true; });
  document.addEventListener('pointerup', () => { ui.pointerDown = false; });
  document.addEventListener('click', e => {
    if (e.target.id === 'modal') { $('#modal').hidden = true; return; }  // click outside the box closes it
    const p = e.target.closest('[data-panel]');
    if (p) { openPanel(p.dataset.panel); return; }
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act]; if (!fn) return;
    fn(el.dataset, el); ui.dirty = true; renderPanel(); updateTop();
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('select[data-set]'); if (!el) return;
    G.settings[el.dataset.set] = +el.value; el.blur(); ui.dirty = true;
    if (el.dataset.set === 'fade') applyFade();
    if (el.dataset.set === 'volume') sfx('gem');
  });
  cv.addEventListener('mousedown', e => { const r = cv.getBoundingClientRect(); clickAt(e.clientX - r.left, e.clientY - r.top); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) $('#modal').hidden = true;
    else if (ui.panel) openPanel(ui.panel);
    else if (isFullscreen()) toggleFullscreen();
  });
  document.addEventListener('fullscreenchange', () => { if (!Bridge.api && !document.fullscreenElement && isFullscreen()) { document.body.classList.remove('fs'); setTimeout(resize, 80); } });
  // sim loop (runs even when not painting); long gaps (sleep/minimise) use the offline estimate
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(); let dt = (now - last) / 1000; last = now;
    if (dt > 300 && G.challenge) dt = 0;
    if (dt > 300) { const r = offline(dt, 1); toast(`Caught up ${fmtTime(dt)}: +${fmt(r.gold)} gold`, '#ffd54f'); dt = 0; }
    G.stats.time += dt;  // (real playtime; ⏩ only speeds up the game itself)
    dt *= gameSpeed();
    while (dt > 0) { const d = Math.min(dt, 0.05); tickBattle(d); dt -= d; }
  }, 50);
  const frame = () => { requestAnimationFrame(frame); draw(); };
  requestAnimationFrame(frame);
  setInterval(() => {
    updateTop();
    const selecting = document.activeElement && document.activeElement.tagName === 'SELECT';
    if (ui.panel && ui.dirty && !ui.pointerDown && !selecting && performance.now() - ui.lastRender > 500) renderPanel();
  }, 250);
  setInterval(automation, 1000);
  setInterval(samplePace, 10000);
  // 🌙 farm-only while the window is minimized or hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden) goAway(); else comeBack(); });
  addEventListener('focus', comeBack);
  addEventListener('pointerdown', comeBack);
  if (Bridge.api) {
    setTimeout(() => { Bridge.call('backup', saveData(), 'auto'); applyFade(); }, 3000);
    setInterval(() => Bridge.call('backup', saveData(), 'auto'), 30 * 60 * 1000);
  }
  setInterval(save, 15000);
  addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  updateTop();
  window.PD = { G: () => G, RT: () => RT, simulate, setHeadless: v => { headless = v; }, setSimFast: v => { simFast = v; }, save };
}
boot();
