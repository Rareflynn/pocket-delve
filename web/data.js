'use strict';
// ============================================================
//  Pocket Delve — content
// ============================================================

// Combat numbers v4: everything in combat that grows with progress (enemy stats per floor, gear per
// item level, rarity/modifier power, compounding upgrades, Soul Power, hero level, speed overflow)
// grows at COMBAT_SCALE of its old rate in log terms, so e60 becomes ~e18. Fight-sized ratios (hits to
// kill, boss ×12, traits, skill %) are unchanged, so fights play the same.
// v5: 0.3 → 0.2 (floor ~800 went from ~Qa to ~B)
const COMBAT_SCALE = 0.2, COMBAT_SCALE_V4 = 0.3;
const cs = m => Math.pow(m, COMBAT_SCALE);
const COMBAT_VERSION = 5;  // G.itemScale: saved gear below this gets rescaled

// ---------- 12x12 pixel sprites ('.' = transparent). Heroes face right; enemies are drawn mirrored. ----------
const SPRITES = {
  warrior: { pal: { H: '#9ea7ad', V: '#263238', S: '#f1c27d', W: '#eceff1', D: '#795548', A: '#b0bec5', B: '#1e88e5', L: '#37474f' }, rows: [
    '....HHHH....', '...HHHHHH...', '...HVSVSH..W', '...HSSSSH..W', '....SSSS...W', '..DAABBAA.W.',
    '.DDABBBBAAW.', '.DDABBBBA...', '.DDAABBAA...', '...LL..LL...', '...LL..LL...', '..LLL..LLL..'] },
  ranger: { pal: { G: '#2e7d32', S: '#f1c27d', E: '#222222', T: '#43a047', N: '#6d4c41', D: '#a1887f', W: '#eeeeee', L: '#3e2723' }, rows: [
    '....GGGG....', '...GGGGGG.D.', '...GSESEG.DW', '...GSSSSG.DW', '....SSSS..DW', '...TTTTTT.D.',
    '..STTTTTTSD.', '...TTNNTT...', '...TTTTTT...', '...LL..LL...', '...LL..LL...', '..NNN..NNN..'] },
  mage: { pal: { P: '#7b1fa2', Y: '#ffd54f', O: '#8d6e63', S: '#f1c27d', E: '#222222' }, rows: [
    '.....PP.....', '....PPPP....', '...PPPPPP..Y', '..PPPPPPPP.O', '...SESES...O', '...SSSSS...O',
    '..PPPPPPP.SO', '.PPPPPPPPP.O', '.PPPYPPPPP.O', '..PPPPPPP..O', '..PPPPPPP..O', '.PPP...PPP..'] },
  cleric: { pal: { W: '#eceff1', Y: '#ffca28', S: '#f1c27d', E: '#222222', N: '#6d4c41' }, rows: [
    '....WWWW....', '...WWWWWW...', '...WSESEW.Y.', '...WSSSSW.Y.', '....SSSS.YYY', '...WWWWWW.Y.',
    '..SWWYYWWSY.', '...WWYYWW...', '...WWWWWW...', '...WW..WW...', '...WW..WW...', '..NNN..NNN..'] },
  skeleton: { pal: { B: '#e0e0d0', K: '#222222' }, rows: [
    '....BBBB....', '...BBBBBB...', '...BKBBKB...', '...BBBBBB...', '....BKKB....', '.....BB.....',
    '...BBBBBB...', '..B.BBBB.B..', '..B.BBBB.B..', '....B..B....', '....B..B....', '...BB..BB...'] },
  zombie: { pal: { G: '#7cb342', K: '#111111', R: '#5d1a1a', C: '#26a69a', P: '#3949ab' }, rows: [
    '....GGGG....', '...GGGGGG...', '...GKGGKG...', '...GGGGGG...', '....GRRG....', '...CCCCCCGGG',
    '...CCCCCC...', '...CCCCCC...', '...PPPPPP...', '...PP..PP...', '...PP..PP...', '..GGG..GGG..'] },
  bat: { pal: { B: '#4a3b5c', R: '#ff5252' }, rows: [
    '............', '............', 'B..........B', 'BB...BB...BB', 'BBB.BBBB.BBB', 'BBBBBRRBBBBB',
    '.BBBBBBBBBB.', '..BB.BB.BB..', '............', '............', '............', '............'] },
  slime: { pal: { G: '#66bb6a', L: '#a5d6a7', K: '#1b5e20' }, rows: [
    '............', '............', '............', '............', '....GGGG....', '..GGGGGGGG..',
    '.GGLGGGGGGG.', '.GGKGGGKGGG.', 'GGGGGGGGGGGG', 'GGGGGGGGGGGG', 'GGGGGGGGGGGG', '.GGGGGGGGGG.'] },
  mushroom: { pal: { R: '#c62828', W: '#ffffff', S: '#efebe9', K: '#3e2723' }, rows: [
    '..RRRRRRRR..', '.RRWRRRRWRR.', 'RRRRRRWRRRRR', 'RRWRRRRRRRWR', '.....SS.....', '....SKSKS...',
    '....SSSSS...', '...SSSSSSS..', '...SSSSSSS..', '....SSSSS...', '....SS.SS...', '...SSS.SSS..'] },
  imp: { pal: { H: '#ffffff', R: '#d84315', Y: '#ffeb3b', K: '#330000', T: '#bf360c' }, rows: [
    '...H....H...', '...RRRRRR...', '..RRRRRRRR..', '..RYRRRRYR..', '..RRRKKRRR..', '...RRRRRR...',
    '.RRRRRRRRRR.', 'R.RRRRRRRR.R', '..RRRRRRRR..', '...RR..RR...', '...RR..RR...', '..RRR..RRR.T'] },
  golem: { pal: { D: '#4e342e', O: '#ff6f00' }, rows: [
    '...DDDDDD...', '..DDDDDDDD..', '..DODDDDOD..', '..DDDDDDDD..', 'DDDDDDDDDDDD', 'DOODDDDDDOOD',
    'DDDDDOODDDDD', 'DDDDDDDDDDDD', '.DDDDDDDDDD.', '..DDD..DDD..', '..DDD..DDD..', '.DDDD..DDDD.'] },
  wolf: { pal: { W: '#b0bec5', K: '#1976d2', N: '#333333' }, rows: [
    '............', '.........W.W', '........WWWW', '........WKWW', 'W.......WWWN', 'WWWWWWWWWWW.',
    '.WWWWWWWWWW.', '.WWWWWWWWW..', '.WW.WW..WW..', '.WW.WW..WW..', '.W..W....W..', '............'] },
  yeti: { pal: { W: '#eceff1', B: '#5c6bc0' }, rows: [
    '...WWWWWW...', '..WWWWWWWW..', '..WBBWWBBW..', '..WWBBBBWW..', '.WWWWWWWWWW.', 'WWWWWWWWWWWW',
    'WW.WWWWWW.WW', 'WW.WWWWWW.WW', '...WWWWWW...', '...WW..WW...', '...WW..WW...', '..WWW..WWW..'] },
  wisp: { pal: { C: '#4fc3f7', W: '#e1f5fe', K: '#01579b' }, rows: [
    '............', '.....CC.....', '....CCCC....', '...CCWWCC...', '..CCWWWWCC..', '..CCWKKWCC..',
    '..CCWWWWCC..', '...CCWWCC...', '....CCCC....', '.....CC.....', '....C..C....', '...C....C...'] },
  shade: { pal: { S: '#455a64', R: '#ff1744' }, rows: [
    '....SSSS....', '...SSSSSS...', '...SRSSRS...', '...SSSSSS...', '..SSSSSSSS..', '.SSSSSSSSSS.',
    '.SSSSSSSSSS.', '..SSSSSSSS..', '..SSSSSSSS..', '...SSSSSS...', '...S.SS.S...', '..S..S...S..'] },
  eye: { pal: { P: '#6a1b9a', W: '#ffffff', R: '#d50000', K: '#000000' }, rows: [
    '............', '...PPPPPP...', '..PPWWWWPP..', '.PPWWWWWWPP.', '.PWWRRRRWWP.', 'PWWRRKKRRWWP',
    'PWWRRKKRRWWP', '.PWWRRRRWWP.', '.PPWWWWWWPP.', '..PPWWWWPP..', '...PPPPPP...', '............'] },
  knight: { pal: { A: '#263238', R: '#e040fb', V: '#4a148c', S: '#b388ff' }, rows: [
    '....AAAA....', '...AAAAAA...', '...ARRRRA...', '...AAAAAA...', '....AAAA....', '..AAAAAAAA.S',
    '.AAAVVVVAAS.', '.AAAVVVVAS..', '..AAVVVVAA..', '...AA..AA...', '...AA..AA...', '..AAA..AAA..'] },
  ghost: { pal: { W: '#dfe8ff', K: '#1a1a2e' }, rows: [
    '....WWWW....', '...WWWWWW...', '..WWWWWWWW..', '..WKKWWKKW..', '..WKKWWKKW..', '..WWWWWWWW..',
    '..WWWKKWWW..', '..WWWWWWWW..', '..WWWWWWWW..', '..WWWWWWWW..', '..W.WW.WW.W.', '............'] },
  rat: { pal: { G: '#8d8d8d', E: '#e6a0a0', K: '#000000', N: '#e6a0a0', T: '#e6a0a0' }, rows: [
    '............', '............', '............', '............', '............', '........EE..',
    '.......GGGG.', '..GGGGGGGKGN', '.GGGGGGGGGG.', 'T.GGGGGGGG..', 'TT.G..G..G..', '............'] },
  cultist: { pal: { R: '#6a1b1b', D: '#1a0a0a', Y: '#ffeb3b', G: '#ffc107', S: '#8d6e63' }, rows: [
    '....RRRR....', '...RRRRRR...', '...RDYDYR...', '...RDDDDR...', '....RRRR....', '...RRRRRR.S.',
    '..RRRRRRRRS.', '..RRRGRRR.S.', '..RRRRRRR.S.', '..RRRRRRR.S.', '..RRRRRRR.S.', '.RRRR.RRRR..'] },
  spider: { pal: { B: '#3b2f2f', L: '#2a2222', R: '#ff1744' }, rows: [
    '............', '............', '............', '............', 'L..L....L..L', '.L..LBBL..L.',
    '..LBBBBBBL..', '.LBBBBBBRBRL', 'L.BBBBBBBBB.', '.L.L.LL.L.L.', 'L..L.L..L..L', '............'] },
  beetle: { pal: { S: '#2e7d6b', L: '#80cbc4', H: '#1b3b35', K: '#111111' }, rows: [
    '............', '............', '............', '...SSSSSS...', '..SSLSSSSS..', '.SSLSSSSSSHH',
    '.SSSSSSSSSHK', '.SSSSSSSSSHH', '..SSSSSSSS..', '..K.K..K.K..', '.K..K..K..K.', '............'] },
  toad: { pal: { G: '#558b2f', K: '#000000', R: '#8d2020', L: '#c5e1a5' }, rows: [
    '............', '............', '............', '............', '......GG.GG.', '.....GKGGKGG',
    '...GGGGGGGGG', '..GGGGGGGRRR', '..GGLLLLGGGG', '.GGGLLLLGGG.', '.GG.GG.GG.GG', 'GG..........'] },
  lizard: { pal: { O: '#ff7043', Y: '#ffca28', K: '#000000', T: '#e64a19' }, rows: [
    '............', '............', '............', '............', '............', '.........OOO',
    '........OOKO', 'T..OOOOOOOOO', 'TTOOOYOOYOO.', '.T.OOOOOOO..', '...O.O..O.O.', '..O..O.O..O.'] },
  skull: { pal: { W: '#eeeeee', K: '#111111' }, rows: [
    '............', '...WWWWWW...', '..WWWWWWWW..', '.WWWWWWWWWW.', '.WKKWWWWKKW.', '.WKKWWWWKKW.',
    '.WWWWKKWWWW.', '..WWWWWWWW..', '...WKWKWK...', '...WWWWWW...', '............', '............'] },
  demon: { pal: { H: '#e0e0e0', D: '#8e1b3a', Y: '#ffeb3b', K: '#000000' }, rows: [
    '..H......H..', '..HH....HH..', '...DDDDDD...', '..DDYDDYDD..', '..DDDDDDDD..', '...DDKKDD...',
    '.DDDDDDDDDD.', 'DD.DDDDDD.DD', 'D..DDDDDD..D', '...DD..DD...', '...DD..DD...', '..DDD..DDD..'] },
  chest: { pal: { G: '#ffb300', B: '#6d4c41', Y: '#fff59d' }, rows: [
    '............', '............', '............', '..GGGGGGGG..', '.GBBBBBBBBG.', '.GBBBBBBBBG.',
    '.GGGGYYGGGG.', '.GBBBYYBBBG.', '.GBBBBBBBBG.', '.GBBBBBBBBG.', '.GGGGGGGGGG.', '............'] },
  // --- sprites for the Sunken Grotto, Desert Tomb and Crystal Caverns ---
  crab: { pal: { R: '#e53935', K: '#111111', L: '#ff8a80' }, rows: [
    '............', '............', '............', '.R........R.', 'RR.K....K.RR', '.R.K....K.R.',
    '..RRRRRRRR..', '.RRRRRRRRRR.', '.RRLRRRRLRR.', '..RRRRRRRR..', '.R.R.RR.R.R.', 'R..R....R..R'] },
  jelly: { pal: { P: '#ba68c8', L: '#f3e5f5', K: '#4a148c' }, rows: [
    '............', '....PPPP....', '..PPPPPPPP..', '.PPLLPPPPPP.', '.PLLPPPPPPP.', '.PPPPKPPKPP.',
    '.PPPPPPPPPP.', '..P.P..P.P..', '..P.P..P.P..', '.P..P..P..P.', '.P...P..P.P.', '..P..P...P..'] },
  fish: { pal: { B: '#546e7a', R: '#e53935', K: '#000000', W: '#ffffff' }, rows: [
    '............', '............', '............', '......BBB...', 'B...BBBBBB..', 'BB.BBBBBKBB.',
    'BBBBBBBBBBWW', 'BB.BBRRRBBW.', 'B...BBBBBB..', '......BB....', '............', '............'] },
  mummy: { pal: { W: '#e8dcb8', D: '#a1887f', G: '#76ff03' }, rows: [
    '....WWWW....', '...WWDWWW...', '...WGWWGW...', '...WWWWDW...', '....WWWW....', '..WWWDWWWW..',
    '.WW.WWWWD.WW', '....WDWWW...', '....WWWDW...', '....WW.WW...', '....DW.WD...', '...WWW.WWW..'] },
  scorpion: { pal: { B: '#c77c2e', T: '#a0522d', C: '#d98c3e', K: '#000000' }, rows: [
    '............', '..TT........', '.T..T.......', '.T...T......', '.....T......', '......T..C.C',
    '....BBBBB.CC', '..BBBBBBBBC.', '.BBBBBBBKB..', '.B.B.B.B.B..', 'B.B.B.B.B...', '............'] },
  snake: { pal: { G: '#c0a060', Y: '#7a5c2e', K: '#000000', R: '#e53935' }, rows: [
    '............', '............', '............', '........GGG.', '.......GGKGG', '........GG.R',
    '.........GG.', '..GGGGGGGGG.', '.GYGYGYGYGG.', 'GGGGGGGGGG..', '.GGG........', '............'] },
  crystal: { pal: { C: '#b388ff', L: '#ede7f6', D: '#6a1b9a', K: '#1a0033' }, rows: [
    '.....CC.....', '....CLLC....', '....CLCC....', '...CLCCCC...', '.C.CLCCCC.C.', 'CLCCKCCKCCLC',
    '.CCCCCCCCCC.', '..CCCCCCCC..', '...CDCCDC...', '....CDDC....', '.....CC.....', '............'] },
  // --- sprites for the Overgrown Ruins and Storm Peaks ---
  plant: { pal: { G: '#2e7d32', R: '#c62828', W: '#ffffff', L: '#66bb6a' }, rows: [
    '....GGGG....', '...GRRRRG...', '..GRRWRWRG..', '..GRRRRRRRG.', '...GRRRRRG..', '....GGGGG...',
    '......G.....', '..LL..G.....', '.LLLL.G..LL.', '..LL.GG.LLLL', '.....G...LL.', '...GGGGG....'] },
  fly: { pal: { W: '#cfd8dc', B: '#5d4037', K: '#212121', R: '#e53935' }, rows: [
    '............', '...WW..WW...', '..WWWWWWWW..', '...WW..WW...', '....BBBB....', '...BBBBBBKKK',
    '..BBRBBBB...', '.BBBBBBB....', '..B.B.B.....', '.B..B..B....', '............', '............'] },
  treant: { pal: { L: '#43a047', G: '#c0ca33', B: '#6d4c41', K: '#ffeb3b', O: '#3e2723' }, rows: [
    '..LL.LLL.L..', '.LLLLLLLLLL.', 'LLLLGLLLLLLL', '.LLLLLLLGLL.', '...BBBBBB...', '...BKBBKB...',
    '..BBBBBBBB..', '.B.BBOOBB.B.', 'B..BBBBBB..B', '...BBBBBB...', '..BB.BB.BB..', '.BB..BB..BB.'] },
  bird: { pal: { B: '#8d6e63', W: '#d7ccc8', K: '#000000', O: '#ffb300', Y: '#ffb300' }, rows: [
    '............', '.......BBB..', '......BBKBO.', '......BBBBOO', 'W.....BBBB..', 'WW...BBBBB..',
    'WWW.BBBBBB..', '.WWWBBBBB...', '..WWWWBB....', '....B.B.....', '....Y.Y.....', '...YY.YY....'] },
  // --- sprites for the Haunted Manor, Blood Swamp, Bone Wastes, Dragon's Roost and Celestial Spire ---
  dragon: { pal: { R: '#c62828', K: '#000000', W: '#ef9a9a', Y: '#ffca28' }, rows: [
    '............', '.......RR.R.', '......RRRRR.', '..W..RRKRRRR', '.WW.RRRRR.YY', 'WWWRRRRR....',
    '.WRRRRRRR...', '..RRRYYRR...', '..RRRRRRR...', '.RR.RR.RR...', '.R..R...R...', '............'] },
  bear: { pal: { B: '#6d4c41', K: '#000000', N: '#bcaaa4' }, rows: [
    '............', '..BB....BB..', '..BBBBBBBB..', '.BBKBBBBKBB.', '.BBBBNNBBBB.', '.BBBBNNBBBB.',
    '..BBBBBBBB..', '.BBBBBBBBBB.', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB', '.BBB....BBB.', '.BBB....BBB.'] },
  witch: { pal: { K: '#212121', G: '#8bc34a', E: '#000000', P: '#4a148c', S: '#795548' }, rows: [
    '.....K......', '....KKK.....', '...KKKKK....', '.KKKKKKKKK..', '...GEGEG....', '...GGGGG....',
    '..PPPPPPP.S.', '.PPPPPPPPPS.', '..PPPPPPP.S.', '..PPPPPPP.S.', '.PPPPPPPPPS.', '.PPP...PPP..'] },
  gargoyle: { pal: { S: '#78909c', R: '#ff1744', K: '#263238' }, rows: [
    '..S......S..', '.SS......SS.', 'SSS.SSSS.SSS', 'SS.SRSSRS.SS', 'S..SSSSSS..S', '...SSKKSS...',
    '..SSSSSSSS..', '.S.SSSSSS.S.', '...SSSSSS...', '...SS..SS...', '..SSS..SSS..', '............'] },
  worm: { pal: { P: '#d7a07a', K: '#000000', T: '#ffffff' }, rows: [
    '............', '............', '............', '.......PPPP.', '......PKPPKP', '......PPPPPP',
    '.....PPTTTT.', '..PPPPPP....', '.PPPPPP.....', 'PPPPPP......', 'PPPP........', '............'] },
  // --- sprites for the Ethereal Library and Dwarven Forge ---
  book: { pal: { B: '#6d4c41', P: '#fff8e1', K: '#000000', R: '#e53935' }, rows: [
    '............', '............', '.BB......BB.', '.BPB....BPB.', '.BPPB..BPPB.', '.BPPPBBPPPB.',
    '.BPPKPPKPPB.', '.BPPPPPPPPB.', '.BPPPRRPPPB.', '.BBBBBBBBBB.', '............', '............'] },
  dwarf: { pal: { H: '#9e9e9e', S: '#f1c27d', E: '#000000', R: '#bf360c', A: '#607d8b', B: '#5d4037', W: '#cfd8dc' }, rows: [
    '............', '....HHHH....', '...HHHHHH...', '...HSESEH..W', '...RSSSSR.WW', '...RRRRRR..B',
    '..ARRRRRRA.B', '.AAAARRAAAAB', '..AAAAAAAA..', '..BB....BB..', '..BB....BB..', '.BBB....BBB.'] },
  cookie: { pal: { C: '#e8a93c', L: '#ffd36b', K: '#5a3212' }, rows: [
    '............', '............', '............', '....CCCC....', '...CLLLKC...', '..CLKLLLLC..',
    '..CLLLLKLC..', '..CKLLLLLC..', '...CLLKLC...', '....CCCC....', '............', '............'] },
  squid: { pal: { P: '#26697a', W: '#ffffff', K: '#000000' }, rows: [
    '....PPPP....', '...PPPPPP...', '..PPPPPPPP..', '..PWKPPWKP..', '..PPPPPPPP..', '...PPPPPP...',
    '..PPPPPPPP..', '.P.P.PP.P.P.', 'P..P.PP.P..P', 'P.P..P..P.P.', '.P..P..P..P.', '..P..P..P...'] },
};

// ---------- the hero ----------
// base stats were 160 hp / 12 atk / 1.35 speed / 8% crit: the fresh hero one-shot most early monsters,
// so he starts weaker and the first gear and upgrades matter more (sim: without upgrades he stalls around
// floor 18; buying upgrades he keeps going. 5 atk / 110 hp was too weak: died on floor 3). hp 130 → 120 on request
const HERO = { name: 'Warrior', sprite: 'warrior', color: '#42a5f5', hp: 120, atk: 8, spd: 1.2, crit: 5, x: 110 };
// attacks per second are capped here; attack speed above the cap turns into extra health and damage
// (overflow^share → health, overflow^(1-share) → damage)
const ATTACK_SPEED_CAP = 3;
const CRIT_BASE = 100;  // crits deal +100% damage before any bonuses (was +50%)
let OVERFLOW_HP_SHARE = 0.62;

// ---------- skills: abilities the hero fires automatically when off cooldown ----------
// Separate from upgrades and gear: the hero learns each one on reaching hero level `lvl` (listed in the
// order they're learned). Hero level resets on rebirth, so they're relearned on the way back up.
// Each can be switched off in the Hero panel.
// cd = seconds; first = seconds before the first use on a floor run; dmg = × attack.
const SKILLS = {
  cleave:    { name: 'Cleave', icon: '🌀', color: '#90caf9', lvl: 3, cd: 7, first: 3, dmg: 2.5,
    desc: 'Hits every enemy in reach for 250% damage.' },
  rend:      { name: 'Rend', icon: '🩸', color: '#e53935', lvl: 8, cd: 8, first: 1.5, dmg: 3, secs: 4,
    desc: 'Tears into the front enemy, making it bleed for 300% damage over 4s.' },
  bash:      { name: 'Shield Bash', icon: '🛡', color: '#ffe066', lvl: 15, cd: 10, first: 4, dmg: 1.5, stun: 2,
    desc: 'Bashes the front enemy for 150% damage and stuns everything in reach for 2s.' },
  execute:   { name: 'Execute', icon: '🪓', color: '#ff5252', lvl: 25, cd: 6, first: 2, dmg: 4, below: 0.3,
    desc: 'Strikes the front enemy for 400% damage. Monsters under 30% health die instantly (bosses take 800% instead).' },
  thunder:   { name: 'Thunder Strike', icon: '⚡', color: '#fff176', lvl: 40, cd: 9, first: 3.5, dmg: 5,
    desc: 'Lightning strikes the toughest enemy on screen (even ones hanging back) for 500% damage.' },
  warcry:    { name: 'War Cry', icon: '📣', color: '#ff9800', lvl: 60, cd: 18, first: 5, secs: 6, reduce: 0.4,
    desc: 'Enemies deal 40% less damage for 6s.' },
  whirlwind: { name: 'Whirlwind', icon: '🌪', color: '#b2ebf2', lvl: 85, cd: 15, first: 6, dmg: 0.8, hits: 6, every: 0.25,
    desc: 'Spins for 1.5s, hitting every enemy in reach 6 times for 80% damage.' },
  slam:      { name: 'Ground Slam', icon: '💥', color: '#bcaaa4', lvl: 115, cd: 12, first: 7, dmg: 2,
    desc: 'Slams the ground, hitting every enemy on screen for 200% damage.' },
  fury:      { name: 'Battle Fury', icon: '🔥', color: '#ff7043', lvl: 150, cd: 20, first: 4, secs: 5, mult: 1.6,
    desc: 'Your attacks deal +60% damage for 5s.' },
};

// pacing: every skill's level (and every upgrade's unlock floor, below) is stretched by this much
// (skills 1.5 → 2.5: Cleave at level 5 hit too hard that early; now Cleave 8 … Battle Fury 375)
const SKILL_PACE = 2.5, UNLOCK_PACE = 1.5;
for (const S of Object.values(SKILLS)) S.lvl = Math.round(S.lvl * SKILL_PACE);

// ---------- zones & enemies ----------
const ZONES = [
  { name: 'Forgotten Crypt', mobs: ['skeleton', 'bat', 'zombie', 'ghost', 'rat', 'cultist', 'skel_archer', 'bone_hound'], boss: { sprite: 'skeleton', name: 'Bone King', pal: { B: '#ffd54f' } },
    bg: { back: '#1b1824', wall: '#393247', wall2: '#2d2738', floor: '#4a4152', floor2: '#3d3545', deco: 'torch' } },
  { name: 'Fungal Hollows', mobs: ['slime', 'mushroom', 'spore', 'spider', 'beetle', 'toad', 'spore_bat', 'puffshroom'], boss: { sprite: 'mushroom', name: 'Myconid Queen', pal: { R: '#8e24aa' } },
    bg: { back: '#131f1a', wall: '#24382e', wall2: '#1b2b23', floor: '#3b4a33', floor2: '#2f3d29', deco: 'shroom' } },
  { name: 'Overgrown Ruins', mobs: ['vine_lasher', 'dart_frog', 'mosquito', 'stone_guardian', 'panther', 'shaman', 'jungle_spider'], boss: { sprite: 'treant', name: 'Ancient Treant' },
    bg: { back: '#0f1a0c', wall: '#3a4a2e', wall2: '#2f3d25', floor: '#4e6b34', floor2: '#425c2b', deco: 'vines' } },
  { name: 'Sunken Grotto', mobs: ['crab', 'jelly', 'piranha', 'drowned', 'siren', 'snapper', 'sea_serpent'], boss: { sprite: 'squid', name: 'The Kraken' },
    bg: { back: '#081a24', wall: '#16404f', wall2: '#11333f', floor: '#2a5a5e', floor2: '#224c50', deco: 'bubbles' } },
  { name: 'Molten Depths', mobs: ['imp', 'golem', 'firebat', 'salamander', 'hellhound', 'fire_skull', 'lava_slime', 'magma_scorpion'], boss: { sprite: 'golem', name: 'Infernal Colossus', pal: { O: '#ffee58', D: '#7f1d1d' } },
    bg: { back: '#210d0a', wall: '#4a1f16', wall2: '#3a1810', floor: '#5a2a1a', floor2: '#4a2012', deco: 'lava' } },
  { name: 'Desert Tomb', mobs: ['mummy', 'scorpion', 'sand_snake', 'scarab', 'tomb_archer', 'sand_wraith', 'dune_crab'], boss: { sprite: 'mummy', name: 'Sand Pharaoh', pal: { W: '#ffd54f', D: '#1565c0', G: '#ff1744' } },
    bg: { back: '#2a1d0e', wall: '#6b5330', wall2: '#5a4526', floor: '#c9a86a', floor2: '#b8965a', deco: 'sand' } },
  { name: 'Storm Peaks', mobs: ['harpy', 'storm_elemental', 'thunder_hawk', 'storm_wolf', 'rock_troll', 'sky_knight'], boss: { sprite: 'bird', name: 'Thunderbird', pal: { B: '#fbc02d', W: '#fff59d', O: '#ff6f00', Y: '#ff6f00' } },
    bg: { back: '#141821', wall: '#4a5263', wall2: '#3d4454', floor: '#6b7280', floor2: '#5b6270', deco: 'storm' } },
  { name: 'Frozen Abyss', mobs: ['wolf', 'yeti', 'wisp', 'ice_golem', 'snow_bat', 'frost_spider', 'frost_imp', 'frozen_corpse'], boss: { sprite: 'wolf', name: 'Frost Wyrm', pal: { W: '#80deea', K: '#ffffff' } },
    bg: { back: '#0e1a26', wall: '#2c4a62', wall2: '#223c52', floor: '#9fc3d9', floor2: '#86adc6', deco: 'ice' } },
  { name: 'Crystal Caverns', mobs: ['crystal_golem', 'gem_bat', 'shardling', 'crystal_spider', 'geode_slime', 'prism_eye', 'crystal_jelly'], boss: { sprite: 'crystal', name: 'Prism Heart', pal: { C: '#ff80ab', L: '#ffffff', D: '#ad1457' } },
    bg: { back: '#120b1f', wall: '#2e2150', wall2: '#251a42', floor: '#3d2f63', floor2: '#332756', deco: 'crystal' } },
  { name: 'Clockwork Vault', mobs: ['gear_golem', 'clock_spider', 'automaton', 'spark_drone', 'cog_rat', 'brass_skull'], boss: { sprite: 'knight', name: 'The Machinist', pal: { A: '#ffb300', R: '#e53935', V: '#5d4037', S: '#ffffff' } },
    bg: { back: '#1a130b', wall: '#4a3a24', wall2: '#3d301d', floor: '#5c4a30', floor2: '#4e3f28', deco: 'gears' } },
  { name: 'Shadow Realm', mobs: ['shade', 'eye', 'knight', 'demon', 'wraith', 'doom_skull', 'shadow_spider', 'shadow_serpent'], boss: { sprite: 'eye', name: 'The Hollow', pal: { P: '#000000', R: '#ff1744' } },
    bg: { back: '#0b0712', wall: '#241a33', wall2: '#1a1226', floor: '#2e2440', floor2: '#251c35', deco: 'stars' } },
];
// new zones go after the Shadow Realm so older floors keep their zone
ZONES.push(
  { name: 'Haunted Manor', mobs: ['phantom', 'poltergeist', 'witch', 'gargoyle', 'haunted_armor', 'cursed_doll', 'manor_bat'], boss: { sprite: 'witch', name: 'The Witch Queen', pal: { K: '#4a148c', P: '#000000', G: '#b39ddb' } },
    guard: { sprite: 'knight', name: 'The Headless Knight', pal: { A: '#546e7a', R: '#000000', V: '#37474f', S: '#ff1744' } },
    bg: { back: '#150f1a', wall: '#3b2a3f', wall2: '#2f2133', floor: '#4a3140', floor2: '#3d2835', deco: 'torch' } },
  { name: 'Blood Swamp', mobs: ['swamp_troll', 'leech', 'bog_witch', 'croco', 'swamp_fly', 'mire_slime', 'blood_toad'], boss: { sprite: 'toad', name: 'The Mire Mother', pal: { G: '#4e342e', R: '#b71c1c', L: '#8d6e63' } },
    guard: { sprite: 'snake', name: 'Bog Hydra', pal: { G: '#33691e', Y: '#1b5e20', K: '#ff1744', R: '#b71c1c' } },
    bg: { back: '#140a0a', wall: '#3a1f1f', wall2: '#2e1818', floor: '#4a2b22', floor2: '#3d231c', deco: 'bubbles' } },
  { name: 'Bone Wastes', mobs: ['bone_worm', 'bone_knight', 'vulture', 'dust_devil', 'skeleton_giant', 'grave_rat', 'bone_bear'], boss: { sprite: 'golem', name: 'The Bone Colossus', pal: { D: '#e0e0d0', O: '#ff1744' } },
    guard: { sprite: 'worm', name: 'Sandworm Tyrant', pal: { P: '#c9a86a', K: '#b71c1c' } },
    bg: { back: '#1f1a12', wall: '#5a4d3a', wall2: '#4a3f30', floor: '#b8a57f', floor2: '#a6936f', deco: 'sand' } },
  { name: 'Dragon\'s Roost', mobs: ['drake', 'wyvern', 'kobold', 'dragon_cultist', 'ember_wisp', 'scale_golem', 'fire_bear'], boss: { sprite: 'dragon', name: 'The Ancient Dragon', pal: { R: '#ffb300', W: '#fff59d', Y: '#ff1744' } },
    guard: { sprite: 'dragon', name: 'Elder Wyvern', pal: { R: '#2e7d32', W: '#a5d6a7', Y: '#ffeb3b' } },
    bg: { back: '#1a0c08', wall: '#4a2418', wall2: '#3a1c12', floor: '#5c3020', floor2: '#4c2618', deco: 'lava' } },
  { name: 'Celestial Spire', mobs: ['seraph', 'star_wisp', 'seraph_knight', 'moon_bear', 'comet', 'astral_eye', 'sun_gargoyle'], boss: { sprite: 'squid', name: 'The Star-Eater', pal: { P: '#1a237e', W: '#fff59d', K: '#e040fb' } },
    guard: { sprite: 'knight', name: 'The Archon', pal: { A: '#fff8e1', R: '#ffd54f', V: '#ffe082', S: '#ffffff' } },
    bg: { back: '#0a0d1f', wall: '#27305a', wall2: '#1f274b', floor: '#3a4478', floor2: '#303a68', deco: 'stars' } },
);
ZONES.push(
  { name: 'Sunken Temple', mobs: ['temple_guard', 'naga', 'eel', 'coral_golem', 'drowned_priest', 'pearl_crab', 'abyss_jelly'], boss: { sprite: 'snake', name: 'The Naga Empress', pal: { G: '#00897b', Y: '#004d40', K: '#ffd54f', R: '#e040fb' } },
    guard: { sprite: 'golem', name: 'Coral Colossus', pal: { D: '#f06292', O: '#80deea' } },
    bg: { back: '#06151c', wall: '#1d4a4f', wall2: '#163c40', floor: '#2f6b66', floor2: '#285d58', deco: 'bubbles' } },
  { name: 'Ethereal Library', mobs: ['tome', 'grimoire', 'ink_slime', 'scholar_ghost', 'quill_imp', 'arcane_eye', 'living_statue'], boss: { sprite: 'book', name: 'The Forbidden Codex', pal: { B: '#311b92', P: '#e1bee7', R: '#ffd54f' } },
    guard: { sprite: 'witch', name: 'The Head Librarian', pal: { K: '#4e342e', P: '#1a237e', G: '#ffe0b2', S: '#ffd54f' } },
    bg: { back: '#120d18', wall: '#3e2c4a', wall2: '#33243d', floor: '#5a4032', floor2: '#4c3629', deco: 'torch' } },
  { name: 'Dwarven Forge', mobs: ['dwarf', 'dwarf_berserker', 'forge_golem', 'molten_rat', 'anvil_bot', 'rune_dwarf', 'ember_bat'], boss: { sprite: 'dwarf', name: 'The Forge King', pal: { H: '#ffd54f', R: '#e53935', A: '#ffb300', W: '#ff7043' } },
    guard: { sprite: 'golem', name: 'Iron Sentinel', pal: { D: '#455a64', O: '#ff6d00' } },
    bg: { back: '#1a0f08', wall: '#4a3020', wall2: '#3d2718', floor: '#5c3a22', floor2: '#4e311c', deco: 'lava' } },
  { name: 'Void Rift', mobs: ['void_walker', 'rift_eye', 'null_slime', 'star_spawn', 'void_knight2', 'entropy_wisp', 'chaos_imp'], boss: { sprite: 'eye', name: 'The Unmaker', pal: { P: '#000000', W: '#e040fb', R: '#00e5ff', K: '#ffffff' } },
    guard: { sprite: 'demon', name: 'Rift Tyrant', pal: { D: '#12091f', Y: '#00e5ff', H: '#e040fb' } },
    bg: { back: '#05030a', wall: '#1a0f2e', wall2: '#140a24', floor: '#241638', floor2: '#1c102e', deco: 'stars' } },
);
// each zone has two bosses: its Guardian halfway (floors ending in 10) and its Lord (`boss`) at the end (floors ending in 20).
// From the second lap on, a zone's last floor sends both at once.
const ZONE_GUARDS = [
  { sprite: 'zombie', name: 'The Gravekeeper', pal: { G: '#9e9e9e', C: '#424242', P: '#212121' } },
  { sprite: 'slime', name: 'Sporemaw', pal: { G: '#8e24aa', L: '#e1bee7', K: '#4a148c' } },
  { sprite: 'wolf', name: 'Jungle Stalker', pal: { W: '#1b5e20', K: '#ffeb3b', N: '#0d3311' } },
  { sprite: 'cultist', name: 'The Tidecaller', pal: { R: '#006064', D: '#002f33', Y: '#80deea', G: '#00e5ff' } },
  { sprite: 'dragon', name: 'Magma Wyrm', pal: { R: '#bf360c', W: '#ffab40', Y: '#ffeb3b' } },
  { sprite: 'worm', name: 'Sandworm Matriarch' },
  { sprite: 'yeti', name: 'Storm Giant', pal: { W: '#90a4ae', B: '#fff176' } },
  { sprite: 'bear', name: 'The Frost Bear King', pal: { B: '#e3f2fd', K: '#01579b', N: '#81d4fa' } },
  { sprite: 'golem', name: 'Geode Titan', pal: { D: '#6a1b9a', O: '#80deea' } },
  { sprite: 'dragon', name: 'Clockwork Dragon', pal: { R: '#b08d57', W: '#ffca28', Y: '#4fc3f7', K: '#ff5252' } },
  { sprite: 'witch', name: 'The Nightmare Witch', pal: { K: '#000000', P: '#311b92', G: '#9575cd', S: '#e040fb' } },
];
ZONES.forEach((z, i) => { if (!z.guard) z.guard = ZONE_GUARDS[i]; });
// a few more monsters for the older zones
ZONES[2].mobs.push('grizzly');
ZONES[7].mobs.push('polar_bear');
ZONES[10].mobs.push('shadow_gargoyle');
ZONES[6].mobs.push('storm_gargoyle');
ZONES[9].mobs.push('clock_eye');
// the Void Rift is always the last zone of a lap: zones added later slot in before it.
// ZONES_DEFINED keeps the order the zones were written in (per-zone tables further down are listed in that order)
const ZONES_DEFINED = ZONES.slice();
ZONES.find(z => z.name === 'Void Rift').last = true;
ZONES.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0));
const FLOORS_PER_ZONE = 20;
// hp/atk are multipliers of the floor's base; move = px/s; range > 0 => ranged attacker
const ENEMIES = {
  skeleton: { name: 'Skeleton', sprite: 'skeleton', hp: 1, atk: 1, spd: 0.8, move: 28 },
  bat: { name: 'Bat', sprite: 'bat', hp: 0.55, atk: 0.7, spd: 1.3, move: 55, fly: true },
  zombie: { name: 'Zombie', sprite: 'zombie', hp: 1.9, atk: 1.2, spd: 0.6, move: 16 },
  slime: { name: 'Slime', sprite: 'slime', hp: 1.2, atk: 0.9, spd: 0.8, move: 22 },
  mushroom: { name: 'Shroom Brute', sprite: 'mushroom', hp: 2, atk: 1.3, spd: 0.55, move: 16 },
  spore: { name: 'Spore Spitter', sprite: 'slime', pal: { G: '#ab47bc', L: '#e1bee7', K: '#4a148c' }, hp: 0.7, atk: 1, spd: 0.6, move: 24, range: 1 },
  imp: { name: 'Imp', sprite: 'imp', hp: 0.7, atk: 1.1, spd: 0.7, move: 30, range: 1 },
  golem: { name: 'Magma Golem', sprite: 'golem', hp: 2.2, atk: 1.3, spd: 0.5, move: 14 },
  firebat: { name: 'Fire Bat', sprite: 'bat', pal: { B: '#e65100', R: '#ffeb3b' }, hp: 0.6, atk: 0.8, spd: 1.3, move: 60, fly: true },
  wolf: { name: 'Ice Wolf', sprite: 'wolf', hp: 0.8, atk: 1, spd: 1.2, move: 50 },
  yeti: { name: 'Yeti', sprite: 'yeti', hp: 2.3, atk: 1.3, spd: 0.55, move: 15 },
  wisp: { name: 'Frost Wisp', sprite: 'wisp', hp: 0.7, atk: 1, spd: 0.7, move: 26, range: 1, fly: true },
  shade: { name: 'Shade', sprite: 'shade', hp: 0.8, atk: 1.1, spd: 1.2, move: 48 },
  eye: { name: 'Watcher', sprite: 'eye', hp: 0.8, atk: 1.1, spd: 0.7, move: 22, range: 1, fly: true },
  knight: { name: 'Void Knight', sprite: 'knight', hp: 2.4, atk: 1.4, spd: 0.6, move: 16 },
  // --- added variety ---
  ghost: { name: 'Ghost', sprite: 'ghost', hp: 0.7, atk: 0.9, spd: 0.9, move: 34, fly: true },
  rat: { name: 'Crypt Rat', sprite: 'rat', hp: 0.45, atk: 0.6, spd: 1.6, move: 62 },
  cultist: { name: 'Cultist', sprite: 'cultist', hp: 0.9, atk: 1.2, spd: 0.7, move: 24, range: 1 },
  skel_archer: { name: 'Skeleton Archer', sprite: 'skeleton', pal: { B: '#c9b98f' }, hp: 0.75, atk: 1, spd: 0.7, move: 26, range: 1 },
  spider: { name: 'Cave Spider', sprite: 'spider', hp: 0.7, atk: 1, spd: 1.3, move: 58 },
  beetle: { name: 'Shell Beetle', sprite: 'beetle', hp: 2.6, atk: 0.9, spd: 0.6, move: 14 },
  toad: { name: 'Bog Toad', sprite: 'toad', hp: 1.3, atk: 1.1, spd: 0.8, move: 30 },
  salamander: { name: 'Salamander', sprite: 'lizard', hp: 1, atk: 1.1, spd: 1, move: 40 },
  hellhound: { name: 'Hellhound', sprite: 'wolf', pal: { W: '#6d1b1b', K: '#ffab00', N: '#ff6d00' }, hp: 0.9, atk: 1.2, spd: 1.2, move: 55 },
  fire_skull: { name: 'Fire Skull', sprite: 'skull', pal: { K: '#ff6d00', W: '#ffcc80' }, hp: 0.6, atk: 1.2, spd: 0.8, move: 30, range: 1, fly: true },
  ice_golem: { name: 'Ice Golem', sprite: 'golem', pal: { D: '#90caf9', O: '#e3f2fd' }, hp: 2.5, atk: 1.3, spd: 0.5, move: 13 },
  snow_bat: { name: 'Snow Bat', sprite: 'bat', pal: { B: '#e3f2fd', R: '#1e88e5' }, hp: 0.6, atk: 0.8, spd: 1.3, move: 58, fly: true },
  frost_spider: { name: 'Frost Spider', sprite: 'spider', pal: { B: '#4f83cc', L: '#2c5aa0', R: '#e1f5fe' }, hp: 0.8, atk: 1.1, spd: 1.3, move: 56 },
  demon: { name: 'Lesser Demon', sprite: 'demon', hp: 1.6, atk: 1.4, spd: 0.8, move: 26 },
  wraith: { name: 'Wraith', sprite: 'ghost', pal: { W: '#7e57c2', K: '#ff1744' }, hp: 0.8, atk: 1.2, spd: 1, move: 40, fly: true },
  doom_skull: { name: 'Doom Skull', sprite: 'skull', pal: { W: '#b39ddb', K: '#e040fb' }, hp: 0.7, atk: 1.3, spd: 0.8, move: 30, range: 1, fly: true },
  // --- extra monsters for the original zones ---
  spore_bat: { name: 'Spore Bat', sprite: 'bat', pal: { B: '#558b2f', R: '#e1bee7' }, hp: 0.6, atk: 0.8, spd: 1.3, move: 56, fly: true },
  lava_slime: { name: 'Lava Slime', sprite: 'slime', pal: { G: '#ff6d00', L: '#ffe082', K: '#4e1a00' }, hp: 1.4, atk: 1.1, spd: 0.7, move: 20 },
  frost_imp: { name: 'Frost Imp', sprite: 'imp', pal: { R: '#4fc3f7', Y: '#ffffff', K: '#01579b', T: '#0288d1' }, hp: 0.7, atk: 1.1, spd: 0.7, move: 30, range: 1 },
  shadow_spider: { name: 'Shadow Spider', sprite: 'spider', pal: { B: '#1a1226', L: '#2e2440', R: '#e040fb' }, hp: 0.8, atk: 1.2, spd: 1.3, move: 58 },
  // --- Sunken Grotto ---
  crab: { name: 'Reef Crab', sprite: 'crab', hp: 1.8, atk: 1, spd: 0.7, move: 20 },
  jelly: { name: 'Stinging Jelly', sprite: 'jelly', hp: 0.6, atk: 1, spd: 1, move: 30, fly: true },
  piranha: { name: 'Piranha', sprite: 'fish', hp: 0.5, atk: 0.9, spd: 1.6, move: 64, fly: true },
  drowned: { name: 'Drowned', sprite: 'zombie', pal: { G: '#80cbc4', C: '#37474f', P: '#263238' }, hp: 1.9, atk: 1.2, spd: 0.6, move: 16 },
  siren: { name: 'Siren', sprite: 'cultist', pal: { R: '#00897b', D: '#004d40', Y: '#b2dfdb', G: '#80deea' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 24, range: 1 },
  snapper: { name: 'Snapping Turtle', sprite: 'beetle', pal: { S: '#5d6b2e', L: '#9ccc65', H: '#33691e' }, hp: 2.8, atk: 1, spd: 0.5, move: 12 },
  // --- Desert Tomb ---
  mummy: { name: 'Mummy', sprite: 'mummy', hp: 2, atk: 1.2, spd: 0.6, move: 15 },
  scorpion: { name: 'Giant Scorpion', sprite: 'scorpion', hp: 1.1, atk: 1.3, spd: 1, move: 40 },
  sand_snake: { name: 'Sand Viper', sprite: 'snake', hp: 0.6, atk: 1.1, spd: 1.4, move: 54 },
  scarab: { name: 'Scarab', sprite: 'beetle', pal: { S: '#c9a227', L: '#fff176', H: '#6d4c41' }, hp: 1.5, atk: 0.9, spd: 0.9, move: 30 },
  tomb_archer: { name: 'Tomb Archer', sprite: 'skeleton', pal: { B: '#d7c49e' }, hp: 0.75, atk: 1.1, spd: 0.7, move: 26, range: 1 },
  sand_wraith: { name: 'Sand Wraith', sprite: 'ghost', pal: { W: '#d7b98e', K: '#5d4037' }, hp: 0.8, atk: 1.1, spd: 1, move: 38, fly: true },
  // --- Crystal Caverns ---
  crystal_golem: { name: 'Crystal Golem', sprite: 'golem', pal: { D: '#7e57c2', O: '#e1bee7' }, hp: 2.6, atk: 1.3, spd: 0.5, move: 13 },
  gem_bat: { name: 'Gem Bat', sprite: 'bat', pal: { B: '#ec407a', R: '#80deea' }, hp: 0.6, atk: 0.8, spd: 1.3, move: 58, fly: true },
  shardling: { name: 'Shardling', sprite: 'crystal', hp: 0.7, atk: 1.2, spd: 0.7, move: 26, range: 1, fly: true },
  crystal_spider: { name: 'Crystal Spider', sprite: 'spider', pal: { B: '#4dd0e1', L: '#0097a7', R: '#ffffff' }, hp: 0.8, atk: 1.1, spd: 1.3, move: 56 },
  geode_slime: { name: 'Geode Slime', sprite: 'slime', pal: { G: '#9575cd', L: '#f3e5f5', K: '#311b92' }, hp: 1.5, atk: 1, spd: 0.8, move: 22 },
  prism_eye: { name: 'Prism Eye', sprite: 'eye', pal: { P: '#00acc1', R: '#ff80ab', W: '#e0f7fa' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 22, range: 1, fly: true },
  // --- one more for each earlier zone ---
  bone_hound: { name: 'Bone Hound', sprite: 'wolf', pal: { W: '#e0e0d0', K: '#d50000', N: '#222222' }, hp: 0.8, atk: 1, spd: 1.2, move: 52 },
  puffshroom: { name: 'Puffshroom', sprite: 'mushroom', pal: { R: '#8d6e63', W: '#ffeb3b', S: '#d7ccc8', K: '#3e2723' }, hp: 0.8, atk: 1, spd: 0.6, move: 18, range: 1 },
  sea_serpent: { name: 'Sea Serpent', sprite: 'snake', pal: { G: '#26a69a', Y: '#004d40', K: '#000000', R: '#ff80ab' }, hp: 1, atk: 1.1, spd: 1.1, move: 44 },
  magma_scorpion: { name: 'Magma Scorpion', sprite: 'scorpion', pal: { B: '#bf360c', T: '#ff6d00', C: '#ff9800', K: '#ffeb3b' }, hp: 1.2, atk: 1.3, spd: 1, move: 38 },
  dune_crab: { name: 'Dune Crab', sprite: 'crab', pal: { R: '#d7b56d', K: '#3e2723', L: '#fff3c4' }, hp: 1.9, atk: 1, spd: 0.7, move: 20 },
  frozen_corpse: { name: 'Frozen Corpse', sprite: 'zombie', pal: { G: '#b3e5fc', K: '#01579b', R: '#4fc3f7', C: '#607d8b', P: '#37474f' }, hp: 2, atk: 1.2, spd: 0.55, move: 15 },
  crystal_jelly: { name: 'Crystal Jelly', sprite: 'jelly', pal: { P: '#4dd0e1', L: '#e0f7fa', K: '#006064' }, hp: 0.7, atk: 1, spd: 1, move: 30, fly: true },
  shadow_serpent: { name: 'Shadow Serpent', sprite: 'snake', pal: { G: '#4a148c', Y: '#1a0033', K: '#ff1744', R: '#e040fb' }, hp: 0.9, atk: 1.3, spd: 1.2, move: 46 },
  // --- Overgrown Ruins ---
  vine_lasher: { name: 'Vine Lasher', sprite: 'plant', hp: 1.6, atk: 1.2, spd: 0.8, move: 14 },
  dart_frog: { name: 'Dart Frog', sprite: 'toad', pal: { G: '#1e88e5', L: '#90caf9', R: '#ffeb3b' }, hp: 0.6, atk: 1.1, spd: 1.2, move: 44 },
  mosquito: { name: 'Giant Mosquito', sprite: 'fly', hp: 0.45, atk: 0.8, spd: 1.6, move: 62, fly: true },
  stone_guardian: { name: 'Stone Guardian', sprite: 'golem', pal: { D: '#607d57', O: '#aed581' }, hp: 2.6, atk: 1.2, spd: 0.5, move: 12 },
  panther: { name: 'Panther', sprite: 'wolf', pal: { W: '#212121', K: '#ffeb3b', N: '#424242' }, hp: 0.9, atk: 1.3, spd: 1.3, move: 60 },
  shaman: { name: 'Tribal Shaman', sprite: 'cultist', pal: { R: '#6d8b3a', D: '#33401a', Y: '#ff7043', G: '#ffca28' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 24, range: 1 },
  jungle_spider: { name: 'Jungle Spider', sprite: 'spider', pal: { B: '#33691e', L: '#1b5e20', R: '#ffeb3b' }, hp: 0.7, atk: 1.1, spd: 1.3, move: 58 },
  // --- Storm Peaks ---
  harpy: { name: 'Harpy', sprite: 'bird', hp: 0.7, atk: 1.1, spd: 1.2, move: 50, fly: true },
  storm_elemental: { name: 'Storm Elemental', sprite: 'wisp', pal: { C: '#fff176', W: '#fffde7', K: '#f57f17' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 26, range: 1, fly: true },
  thunder_hawk: { name: 'Thunder Hawk', sprite: 'bird', pal: { B: '#37474f', W: '#90a4ae', K: '#ffeb3b', O: '#ffeb3b', Y: '#ffeb3b' }, hp: 0.6, atk: 1, spd: 1.5, move: 64, fly: true },
  storm_wolf: { name: 'Storm Wolf', sprite: 'wolf', pal: { W: '#90a4ae', K: '#fff176', N: '#263238' }, hp: 0.9, atk: 1.1, spd: 1.2, move: 52 },
  rock_troll: { name: 'Rock Troll', sprite: 'yeti', pal: { W: '#8d8d8d', B: '#4e342e' }, hp: 2.5, atk: 1.4, spd: 0.5, move: 14 },
  sky_knight: { name: 'Sky Knight', sprite: 'knight', pal: { A: '#1565c0', R: '#fff176', V: '#0d47a1', S: '#e3f2fd' }, hp: 2.2, atk: 1.3, spd: 0.6, move: 18 },
  // --- Clockwork Vault ---
  gear_golem: { name: 'Gear Golem', sprite: 'golem', pal: { D: '#8d6e3f', O: '#ffca28' }, hp: 2.6, atk: 1.3, spd: 0.5, move: 13 },
  clock_spider: { name: 'Clockwork Spider', sprite: 'spider', pal: { B: '#b08d57', L: '#6d5a36', R: '#ff5252' }, hp: 0.8, atk: 1.1, spd: 1.3, move: 56 },
  automaton: { name: 'Automaton', sprite: 'knight', pal: { A: '#a1887f', R: '#4fc3f7', V: '#6d4c41', S: '#ffd54f' }, hp: 2.1, atk: 1.3, spd: 0.6, move: 16 },
  spark_drone: { name: 'Spark Drone', sprite: 'eye', pal: { P: '#8d6e3f', W: '#fff59d', R: '#29b6f6', K: '#01579b' }, hp: 0.7, atk: 1.2, spd: 0.8, move: 26, range: 1, fly: true },
  cog_rat: { name: 'Cog Rat', sprite: 'rat', pal: { G: '#b08d57', E: '#8d6e3f', N: '#ffca28', T: '#6d5a36' }, hp: 0.5, atk: 0.7, spd: 1.6, move: 62 },
  brass_skull: { name: 'Brass Skull', sprite: 'skull', pal: { W: '#d4a95a', K: '#4fc3f7' }, hp: 0.7, atk: 1.3, spd: 0.8, move: 30, range: 1, fly: true },
  // --- bears for older zones ---
  grizzly: { name: 'Grizzly', sprite: 'bear', hp: 2.4, atk: 1.4, spd: 0.6, move: 18 },
  polar_bear: { name: 'Polar Bear', sprite: 'bear', pal: { B: '#eceff1', N: '#b0bec5' }, hp: 2.5, atk: 1.4, spd: 0.6, move: 18 },
  shadow_gargoyle: { name: 'Shadow Gargoyle', sprite: 'gargoyle', pal: { S: '#37474f', R: '#e040fb', K: '#12091f' }, hp: 1.6, atk: 1.3, spd: 0.8, move: 34, fly: true },
  // --- Haunted Manor ---
  phantom: { name: 'Phantom', sprite: 'ghost', pal: { W: '#b0bec5', K: '#263238' }, hp: 0.8, atk: 1.1, spd: 1, move: 38, fly: true },
  poltergeist: { name: 'Poltergeist', sprite: 'skull', pal: { W: '#cfd8dc', K: '#7c4dff' }, hp: 0.6, atk: 1.2, spd: 0.8, move: 30, range: 1, fly: true },
  witch: { name: 'Witch', sprite: 'witch', hp: 0.9, atk: 1.3, spd: 0.7, move: 24, range: 1 },
  gargoyle: { name: 'Gargoyle', sprite: 'gargoyle', hp: 1.8, atk: 1.2, spd: 0.7, move: 28, fly: true },
  haunted_armor: { name: 'Haunted Armor', sprite: 'knight', pal: { A: '#78909c', R: '#b2ff59', V: '#455a64', S: '#cfd8dc' }, hp: 2.4, atk: 1.3, spd: 0.6, move: 16 },
  cursed_doll: { name: 'Cursed Doll', sprite: 'imp', pal: { H: '#fce4ec', R: '#f48fb1', Y: '#000000', K: '#880e4f', T: '#f06292' }, hp: 0.6, atk: 1.1, spd: 1.3, move: 50 },
  manor_bat: { name: 'Vampire Bat', sprite: 'bat', pal: { B: '#1a1a1a', R: '#ff1744' }, hp: 0.6, atk: 0.9, spd: 1.4, move: 60, fly: true },
  // --- Blood Swamp ---
  swamp_troll: { name: 'Swamp Troll', sprite: 'yeti', pal: { W: '#558b2f', B: '#33691e' }, hp: 2.6, atk: 1.4, spd: 0.5, move: 14 },
  leech: { name: 'Giant Leech', sprite: 'worm', pal: { P: '#8e2424', K: '#000000', T: '#ffcdd2' }, hp: 0.9, atk: 1.1, spd: 1.2, move: 34 },
  bog_witch: { name: 'Bog Witch', sprite: 'witch', pal: { K: '#33691e', G: '#aed581', P: '#1b5e20', S: '#4e342e' }, hp: 0.9, atk: 1.3, spd: 0.7, move: 24, range: 1 },
  croco: { name: 'Swamp Croc', sprite: 'lizard', pal: { O: '#33691e', Y: '#827717', T: '#1b5e20' }, hp: 2.2, atk: 1.3, spd: 0.7, move: 22 },
  swamp_fly: { name: 'Blood Fly', sprite: 'fly', pal: { B: '#7f0000', W: '#ef9a9a', R: '#ffeb3b' }, hp: 0.45, atk: 0.9, spd: 1.6, move: 62, fly: true },
  mire_slime: { name: 'Mire Slime', sprite: 'slime', pal: { G: '#5d4037', L: '#a1887f', K: '#3e2723' }, hp: 1.5, atk: 1, spd: 0.8, move: 20 },
  blood_toad: { name: 'Blood Toad', sprite: 'toad', pal: { G: '#b71c1c', L: '#ef9a9a', R: '#000000' }, hp: 1.3, atk: 1.2, spd: 0.8, move: 30 },
  // --- Bone Wastes ---
  bone_worm: { name: 'Bone Worm', sprite: 'worm', pal: { P: '#e0e0d0', K: '#b71c1c', T: '#9e9e9e' }, hp: 1.6, atk: 1.2, spd: 0.8, move: 26 },
  bone_knight: { name: 'Bone Knight', sprite: 'knight', pal: { A: '#e0e0d0', R: '#b71c1c', V: '#bdbdbd', S: '#9e9e9e' }, hp: 2.3, atk: 1.4, spd: 0.6, move: 16 },
  vulture: { name: 'Vulture', sprite: 'bird', pal: { B: '#3e2723', W: '#d7ccc8', K: '#ff1744', O: '#ffcc80', Y: '#ffcc80' }, hp: 0.6, atk: 1, spd: 1.4, move: 60, fly: true },
  dust_devil: { name: 'Dust Devil', sprite: 'wisp', pal: { C: '#c9a86a', W: '#fff3c4', K: '#6d4c41' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 26, range: 1, fly: true },
  skeleton_giant: { name: 'Skeleton Giant', sprite: 'skeleton', pal: { B: '#d7ccc8' }, hp: 2.8, atk: 1.4, spd: 0.5, move: 12 },
  grave_rat: { name: 'Grave Rat', sprite: 'rat', pal: { G: '#bcaaa4', E: '#8d6e63', N: '#ff1744', T: '#8d6e63' }, hp: 0.5, atk: 0.7, spd: 1.6, move: 62 },
  bone_bear: { name: 'Bone Bear', sprite: 'bear', pal: { B: '#d7ccc8', K: '#b71c1c', N: '#8d6e63' }, hp: 2.4, atk: 1.4, spd: 0.6, move: 18 },
  // --- Dragon's Roost ---
  drake: { name: 'Drake', sprite: 'dragon', hp: 1.8, atk: 1.4, spd: 0.8, move: 30 },
  wyvern: { name: 'Wyvern', sprite: 'dragon', pal: { R: '#2e7d32', W: '#a5d6a7', Y: '#ffeb3b' }, hp: 1.1, atk: 1.2, spd: 1.1, move: 50, fly: true },
  kobold: { name: 'Kobold', sprite: 'imp', pal: { H: '#fff3e0', R: '#8d6e63', Y: '#ffeb3b', K: '#3e2723', T: '#5d4037' }, hp: 0.6, atk: 1, spd: 1.3, move: 50 },
  dragon_cultist: { name: 'Dragon Cultist', sprite: 'cultist', pal: { R: '#b71c1c', D: '#4a0000', Y: '#ffab40', G: '#ffd54f' }, hp: 0.9, atk: 1.3, spd: 0.7, move: 24, range: 1 },
  ember_wisp: { name: 'Ember Wisp', sprite: 'wisp', pal: { C: '#ff7043', W: '#ffe0b2', K: '#bf360c' }, hp: 0.7, atk: 1.2, spd: 0.7, move: 26, range: 1, fly: true },
  scale_golem: { name: 'Scale Golem', sprite: 'golem', pal: { D: '#8e2424', O: '#ffca28' }, hp: 2.7, atk: 1.3, spd: 0.5, move: 13 },
  fire_bear: { name: 'Magma Bear', sprite: 'bear', pal: { B: '#4e1a00', K: '#ffeb3b', N: '#ff6d00' }, hp: 2.4, atk: 1.5, spd: 0.6, move: 18 },
  // --- Celestial Spire ---
  seraph: { name: 'Seraph', sprite: 'ghost', pal: { W: '#fff8e1', K: '#ffb300' }, hp: 0.9, atk: 1.2, spd: 1, move: 38, fly: true },
  star_wisp: { name: 'Star Wisp', sprite: 'wisp', pal: { C: '#fff59d', W: '#ffffff', K: '#5c6bc0' }, hp: 0.7, atk: 1.2, spd: 0.7, move: 26, range: 1, fly: true },
  seraph_knight: { name: 'Seraph Knight', sprite: 'knight', pal: { A: '#fff8e1', R: '#4fc3f7', V: '#ffe082', S: '#ffffff' }, hp: 2.3, atk: 1.4, spd: 0.6, move: 18 },
  moon_bear: { name: 'Moon Bear', sprite: 'bear', pal: { B: '#3949ab', K: '#fff59d', N: '#c5cae9' }, hp: 2.4, atk: 1.4, spd: 0.6, move: 18 },
  comet: { name: 'Comet', sprite: 'skull', pal: { W: '#b3e5fc', K: '#1a237e' }, hp: 0.6, atk: 1.3, spd: 0.9, move: 40, range: 1, fly: true },
  astral_eye: { name: 'Astral Eye', sprite: 'eye', pal: { P: '#1a237e', W: '#e8eaf6', R: '#e040fb', K: '#000000' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 22, range: 1, fly: true },
  sun_gargoyle: { name: 'Sun Gargoyle', sprite: 'gargoyle', pal: { S: '#ffca28', R: '#ffffff', K: '#ff6f00' }, hp: 1.8, atk: 1.3, spd: 0.7, move: 28, fly: true },
  // --- Sunken Temple ---
  temple_guard: { name: 'Temple Guard', sprite: 'knight', pal: { A: '#00695c', R: '#ffd54f', V: '#004d40', S: '#80cbc4' }, hp: 2.3, atk: 1.3, spd: 0.6, move: 16 },
  naga: { name: 'Naga', sprite: 'snake', pal: { G: '#26a69a', Y: '#00695c', K: '#ffd54f', R: '#ff80ab' }, hp: 1.1, atk: 1.3, spd: 1.1, move: 44 },
  eel: { name: 'Shock Eel', sprite: 'fish', pal: { B: '#fdd835', R: '#1565c0', W: '#ffffff' }, hp: 0.6, atk: 1.1, spd: 1.5, move: 62, fly: true },
  coral_golem: { name: 'Coral Golem', sprite: 'golem', pal: { D: '#f06292', O: '#80deea' }, hp: 2.6, atk: 1.2, spd: 0.5, move: 13 },
  drowned_priest: { name: 'Drowned Priest', sprite: 'cultist', pal: { R: '#004d40', D: '#00251a', Y: '#b2dfdb', G: '#ffd54f' }, hp: 0.9, atk: 1.3, spd: 0.7, move: 24, range: 1 },
  pearl_crab: { name: 'Pearl Crab', sprite: 'crab', pal: { R: '#f8bbd0', K: '#000000', L: '#ffffff' }, hp: 2, atk: 1, spd: 0.7, move: 20 },
  abyss_jelly: { name: 'Abyss Jelly', sprite: 'jelly', pal: { P: '#1a237e', L: '#e040fb', K: '#00e5ff' }, hp: 0.7, atk: 1.1, spd: 1, move: 30, fly: true },
  // --- Ethereal Library ---
  tome: { name: 'Flying Tome', sprite: 'book', hp: 0.6, atk: 1.1, spd: 1.3, move: 50, fly: true },
  grimoire: { name: 'Grimoire', sprite: 'book', pal: { B: '#4a148c', P: '#e1bee7', R: '#00e5ff' }, hp: 0.8, atk: 1.3, spd: 0.7, move: 26, range: 1, fly: true },
  ink_slime: { name: 'Ink Slime', sprite: 'slime', pal: { G: '#212121', L: '#616161', K: '#000000' }, hp: 1.5, atk: 1, spd: 0.8, move: 20 },
  scholar_ghost: { name: 'Scholar Ghost', sprite: 'ghost', pal: { W: '#d1c4e9', K: '#4527a0' }, hp: 0.8, atk: 1.2, spd: 1, move: 36, fly: true },
  quill_imp: { name: 'Quill Imp', sprite: 'imp', pal: { H: '#ffffff', R: '#5e35b1', Y: '#ffd54f', K: '#1a0033', T: '#311b92' }, hp: 0.6, atk: 1.1, spd: 1.3, move: 50 },
  arcane_eye: { name: 'Arcane Eye', sprite: 'eye', pal: { P: '#4527a0', W: '#ede7f6', R: '#ffd54f', K: '#000000' }, hp: 0.8, atk: 1.2, spd: 0.7, move: 22, range: 1, fly: true },
  living_statue: { name: 'Living Statue', sprite: 'knight', pal: { A: '#bdbdbd', R: '#ffffff', V: '#9e9e9e', S: '#e0e0e0' }, hp: 2.6, atk: 1.3, spd: 0.5, move: 14 },
  // --- Dwarven Forge ---
  dwarf: { name: 'Dwarf Smith', sprite: 'dwarf', hp: 1.6, atk: 1.3, spd: 0.8, move: 24 },
  dwarf_berserker: { name: 'Dwarf Berserker', sprite: 'dwarf', pal: { H: '#bf360c', R: '#ff7043', A: '#8d6e63' }, hp: 1.4, atk: 1.5, spd: 1.1, move: 36 },
  forge_golem: { name: 'Forge Golem', sprite: 'golem', pal: { D: '#37474f', O: '#ff6d00' }, hp: 2.7, atk: 1.3, spd: 0.5, move: 13 },
  molten_rat: { name: 'Molten Rat', sprite: 'rat', pal: { G: '#bf360c', E: '#ff6d00', N: '#ffeb3b', T: '#ff6d00' }, hp: 0.5, atk: 0.8, spd: 1.6, move: 62 },
  anvil_bot: { name: 'Anvil Bot', sprite: 'golem', pal: { D: '#78909c', O: '#4fc3f7' }, hp: 2.2, atk: 1.2, spd: 0.6, move: 16 },
  rune_dwarf: { name: 'Rune Caster', sprite: 'dwarf', pal: { H: '#1565c0', R: '#90caf9', A: '#0d47a1', W: '#4fc3f7', B: '#3e2723' }, hp: 0.9, atk: 1.3, spd: 0.7, move: 24, range: 1 },
  ember_bat: { name: 'Ember Bat', sprite: 'bat', pal: { B: '#bf360c', R: '#ffeb3b' }, hp: 0.6, atk: 0.9, spd: 1.4, move: 60, fly: true },
  // --- Void Rift ---
  void_walker: { name: 'Void Walker', sprite: 'shade', pal: { S: '#12091f', R: '#00e5ff' }, hp: 1, atk: 1.3, spd: 1.2, move: 46 },
  rift_eye: { name: 'Rift Eye', sprite: 'eye', pal: { P: '#000000', W: '#e040fb', R: '#00e5ff', K: '#ffffff' }, hp: 0.8, atk: 1.3, spd: 0.7, move: 22, range: 1, fly: true },
  null_slime: { name: 'Null Slime', sprite: 'slime', pal: { G: '#12091f', L: '#7c4dff', K: '#00e5ff' }, hp: 1.6, atk: 1.1, spd: 0.8, move: 20 },
  star_spawn: { name: 'Star Spawn', sprite: 'squid', pal: { P: '#311b92', W: '#00e5ff', K: '#ffffff' }, hp: 1.8, atk: 1.3, spd: 0.7, move: 22 },
  void_knight2: { name: 'Rift Knight', sprite: 'knight', pal: { A: '#12091f', R: '#00e5ff', V: '#311b92', S: '#e040fb' }, hp: 2.4, atk: 1.4, spd: 0.6, move: 16 },
  entropy_wisp: { name: 'Entropy Wisp', sprite: 'wisp', pal: { C: '#7c4dff', W: '#00e5ff', K: '#000000' }, hp: 0.7, atk: 1.3, spd: 0.8, move: 26, range: 1, fly: true },
  // --- special stages ---
  treasure_goblin: { name: 'Treasure Goblin', sprite: 'imp', pal: { H: '#fff59d', R: '#7cb342', Y: '#ffeb3b', K: '#33691e', T: '#ffd54f' }, hp: 0.8, atk: 0, spd: 0.1, move: 70, harmless: true },
  crystal_bat: { name: 'Crystal Bat', sprite: 'bat', pal: { B: '#4dd0e1', R: '#ffffff' }, hp: 1, atk: 0.6, spd: 1.2, move: 58, fly: true },
  // (depth pass) 📦 Mimic Hoard, and a 7th monster for the zones that only had 6
  mimic: { name: 'Mimic', sprite: 'chest', pal: { G: '#c62828', B: '#4e342e', Y: '#ffffff' }, hp: 1.6, atk: 1.2, spd: 0.8, move: 26 },
  storm_gargoyle: { name: 'Thunder Gargoyle', sprite: 'gargoyle', pal: { S: '#607d8b', R: '#fff176', K: '#263238' }, hp: 1.7, atk: 1.2, spd: 0.8, move: 30, fly: true },
  clock_eye: { name: 'Clockwork Eye', sprite: 'eye', pal: { P: '#8d6e3f', W: '#ffe082', R: '#4fc3f7', K: '#3e2723' }, hp: 0.8, atk: 1.2, spd: 0.8, move: 24, range: 1, fly: true },
  chaos_imp: { name: 'Chaos Imp', sprite: 'imp', pal: { H: '#00e5ff', R: '#4a148c', Y: '#e040fb', K: '#000000', T: '#311b92' }, hp: 0.7, atk: 1.2, spd: 1.3, move: 50 },
};

// ---------- ranged attackers: throwers and archers that attack while they're still walking in ----------
// (`longRange`: they shoot from anywhere on screen, a little weaker per hit to make up for it)
{
  const LR = (name, sprite, pal, hp = 0.7, atk = 0.85) => ({ name, sprite, pal, hp, atk, spd: 0.6, move: 22, range: 1, longRange: true });
  const add = {
    'Forgotten Crypt': ['bone_thrower', LR('Bone Thrower', 'skeleton', { B: '#bcaaa4' })],
    'Fungal Hollows': ['spore_lobber', LR('Spore Lobber', 'mushroom', { R: '#7b1fa2', W: '#e1bee7' })],
    'Overgrown Ruins': ['blowgunner', LR('Blowgunner', 'cultist', { R: '#558b2f', D: '#1b3a0e', Y: '#cddc39', G: '#8bc34a' })],
    'Sunken Grotto': ['harpooner', LR('Harpooner', 'zombie', { G: '#4db6ac', C: '#004d40', P: '#263238' }, 0.9)],
    'Molten Depths': ['magma_hurler', LR('Magma Hurler', 'imp', { R: '#e65100', Y: '#ffeb3b', K: '#3e2723', T: '#ff6d00' })],
    'Desert Tomb': ['sand_slinger', LR('Sand Slinger', 'mummy', { W: '#d7c49e', D: '#8d6e63', G: '#ffab40' }, 0.8)],
    'Storm Peaks': ['storm_archer', LR('Storm Archer', 'skeleton', { B: '#90caf9' })],
    'Frozen Abyss': ['snowball_yeti', LR('Snowball Yeti', 'yeti', { W: '#e3f2fd', B: '#4fc3f7' }, 1.4, 0.8)],
    'Crystal Caverns': ['crystal_sniper', LR('Crystal Sniper', 'eye', { P: '#7e57c2', W: '#ede7f6', R: '#80deea', K: '#000000' })],
    'Clockwork Vault': ['gear_turret', LR('Gear Turret', 'golem', { D: '#b08d57', O: '#4fc3f7' }, 1.3, 0.8)],
    'Shadow Realm': ['void_archer', LR('Void Archer', 'knight', { A: '#1a1226', R: '#e040fb', V: '#311b92', S: '#b388ff' }, 0.9)],
    'Haunted Manor': ['knife_thrower', LR('Knife Thrower', 'cultist', { R: '#4a0000', D: '#1a0000', Y: '#ff1744', G: '#bdbdbd' })],
    'Blood Swamp': ['bog_spitter', LR('Bog Spitter', 'toad', { G: '#6d4c41', L: '#a1887f', R: '#b71c1c' })],
    'Bone Wastes': ['bone_archer', LR('Bone Archer', 'skeleton', { B: '#d7ccc8' })],
    'Dragon\'s Roost': ['kobold_slinger', LR('Kobold Slinger', 'imp', { H: '#fff3e0', R: '#a1887f', Y: '#ff7043', K: '#3e2723', T: '#6d4c41' })],
    'Celestial Spire': ['star_archer', LR('Star Archer', 'knight', { A: '#fff8e1', R: '#ffd54f', V: '#ffe082', S: '#fff59d' })],
    'Sunken Temple': ['naga_archer', LR('Naga Archer', 'cultist', { R: '#00695c', D: '#003d33', Y: '#ffd54f', G: '#26a69a' })],
    'Ethereal Library': ['page_thrower', LR('Page Thrower', 'book', { B: '#8d6e63', P: '#fffde7', R: '#1565c0' })],
    'Dwarven Forge': ['dwarf_crossbow', LR('Dwarf Crossbow', 'dwarf', { H: '#795548', R: '#8d6e63', A: '#546e7a', W: '#bdbdbd' }, 0.9)],
    'Void Rift': ['rift_sniper', LR('Rift Sniper', 'eye', { P: '#12091f', W: '#00e5ff', R: '#e040fb', K: '#ffffff' })],
  };
  for (const z of ZONES) { const a = add[z.name]; if (a) { ENEMIES[a[0]] = a[1]; z.mobs.push(a[0]); } }
  // the old archers shoot from afar too
  for (const k of ['skel_archer', 'tomb_archer']) ENEMIES[k].longRange = true;
}

// ---------- loot ----------
const RARITY = [
  { name: 'Common', color: '#c8c8c8', mult: 1, affixes: 0, w: 600 },
  { name: 'Uncommon', color: '#5fe35f', mult: 1.25, affixes: 1, w: 250 },
  { name: 'Rare', color: '#5b9bff', mult: 1.6, affixes: 2, w: 100 },
  { name: 'Epic', color: '#c86bff', mult: 2.6, affixes: 3, w: 38 },
  { name: 'Legendary', color: '#ffa928', mult: 4, affixes: 4, w: 10 },
  { name: 'Mythic', color: '#ff5dd6', mult: 6, affixes: 5, w: 2 },
  { name: 'Divine', color: '#fff0a8', mult: 9, affixes: 6, w: 0.4 },
  { name: 'Celestial', color: '#63e6ff', mult: 14, affixes: 7, w: 0.08 },
  // from Cosmic up, tiers get extra bonus stats. There are only 16 stat types, so rolls beyond that
  // stack onto stats the item already has
  { name: 'Cosmic', color: '#ff5a5a', mult: 22, affixes: 10, w: 0.015 },
  { name: 'Primordial', color: '#3dffb0', mult: 35, affixes: 12, w: 0.003 },
  // between Primordial and Ascended: 1 in 20M items, exactly 2× Primordial's stats (RARITY_POWER below)
  { name: 'Ethereal', color: '#a8c8ff', mult: 50, affixes: 13, w: 5e-5, shine: true, bonus: 5.5 },
  // ultra-rare tiers: Refined Taste can't reach these, so they stay genuinely rare. shine = animated name
  // weights tuned so that even at max Refined Taste (~32k items/hour late game) they stay very rare:
  // Ascended ~1 in 100k items, Transcendent 1 in 1M, Eternal 1 in 10M, Infinite 1 in 50M, Absolute 1 in 1B
  // `bonus` = bonus-stat strength (others use 1 + 0.35 × tier); these jackpot tiers get a big jump
  { name: 'Ascended', color: '#b8fff2', mult: 60, affixes: 14, w: 5e-6, shine: true, bonus: 7 },
  { name: 'Transcendent', color: '#ffe066', mult: 100, affixes: 16, w: 5e-7, shine: true, bonus: 9 },
  { name: 'Eternal', color: '#f4f4ff', mult: 170, affixes: 19, w: 5e-8, shine: true, bonus: 12 },
  { name: 'Infinite', color: '#ff9ef0', mult: 290, affixes: 22, w: 1e-8, shine: true, rainbow: true, bonus: 15 },
  { name: 'Absolute', color: '#ff3355', mult: 500, affixes: 26, w: 5e-10, shine: true, rainbow: true, bonus: 20 },
];
// Rarity is worth "floors of depth": item stats grow ×1.13 per floor, so a tier worth +N floors
// multiplies stats by 1.13^N. The rarer the tier, the more floors it's worth, so rare finds stay
// best-in-slot for a long time. (`oldMult` = the previous flat multiplier, used to rescale saved gear.)
// Item stats grow ITEM_FLOOR_GROWTH per floor of depth (was 1.13; lowered so rarity lasts longer).
// Rarity multipliers are fixed (defined as 1.13^RARITY_POWER), and `floors` = how many floors deeper
// a plain item must be found to match, which is what the UI shows.
// `*3` values = the uncompressed (item scale 3) curve, kept for migrating older saves.
const ITEM_FLOOR_GROWTH3 = 1.08, ITEM_FLOOR_GROWTH = cs(ITEM_FLOOR_GROWTH3), OLD_ITEM_FLOOR_GROWTH = 1.13;
// Ascended+ were 121/137/151/162/182 (×85–×790); raised so the jackpot tiers are worth far more
// Ethereal (index 10) is worth +ln 2 / (COMBAT_SCALE × ln 1.13) floors of power over Primordial, i.e. ×2 its stats
const RARITY_POWER = [0, 6, 12, 18, 27, 38, 48, 59, 69, 80, 80 + Math.log(2) / (COMBAT_SCALE * Math.log(1.13)), 156, 188, 223, 256, 300];
// OLD_ULTRA_POWER uses the rarity indexes from before Ethereal existed (rarityV < 3 saves)
const OLD_ULTRA_POWER = { 10: 121, 11: 137, 12: 151, 13: 162, 14: 182 }, RARITY_VERSION = 3, ETHEREAL_INDEX = 10;
const affixMult = r => (RARITY[r] && RARITY[r].bonus) || 1 + r * 0.35;
const floorsWorth = mult => Math.round(Math.log(mult) / Math.log(ITEM_FLOOR_GROWTH));
RARITY.forEach((r, i) => { r.oldMult = r.mult; r.mult3 = Math.pow(OLD_ITEM_FLOOR_GROWTH, RARITY_POWER[i]); r.mult = cs(r.mult3); r.floors = floorsWorth(r.mult); });
// Item modifiers: rolled separately from rarity. Power and flavour modifiers roll independently,
// so an item can have one of each (e.g. "Prismatic Keen"). Within a kind, rarest is checked first.
// chance = 1 in N items. mult scales the item's main stats; extra = additional random bonus stats;
// aff = fixed bonus stats added on top. fx = name effect in the UI ('shine' | 'rainbow').
// (listed rarest first within each kind: the roll checks them in this order)
// Paragon (the rarest flavour) carries the fixed bonuses of every other flavour modifier; filled in below
const MODIFIERS = [
  { id: 'paragon', kind: 'flavour', name: 'Paragon', icon: '♾', oneIn: 20000, mult: 2, aff: {}, fx: 'rainbow', sparkle: '#ffe082' },
  // power
  { id: 'voidkissed', kind: 'power', name: 'Void-Kissed', icon: '🕳', oneIn: 500000, mult: 30, extra: 5, fx: 'rainbow', sparkle: '#e040fb' },
  { id: 'starforged', kind: 'power', name: 'Starforged', icon: '🌟', oneIn: 100000, mult: 18, extra: 4, fx: 'rainbow', sparkle: '#fff59d' },
  { id: 'prismatic', kind: 'power', name: 'Prismatic', icon: '🌈', oneIn: 20000, mult: 10, extra: 3, fx: 'rainbow', sparkle: '#ffffff' },
  { id: 'brilliant', kind: 'power', name: 'Brilliant', icon: '💫', oneIn: 10000, mult: 7, extra: 3, fx: 'shine', color: '#ffe0f7', sparkle: '#ffc6ec' },
  { id: 'radiant', kind: 'power', name: 'Radiant', icon: '☀', oneIn: 4000, mult: 5, extra: 2, fx: 'shine', color: '#fff6c2', sparkle: '#fff3a0' },
  { id: 'luminous', kind: 'power', name: 'Luminous', icon: '🔆', oneIn: 2000, mult: 4, extra: 2, fx: 'shine', color: '#d7fbff', sparkle: '#bff4ff' },
  { id: 'glowing', kind: 'power', name: 'Glowing', icon: '✺', oneIn: 1000, mult: 3, extra: 1, fx: 'shine', color: '#b8ffea', sparkle: '#9dffd9' },
  { id: 'sparkling', kind: 'power', name: 'Sparkling', icon: '✧', oneIn: 400, mult: 2, extra: 1, fx: 'shine', color: '#e3f1ff', sparkle: '#cfe8ff' },
  { id: 'gleaming', kind: 'power', name: 'Gleaming', icon: '✴', oneIn: 150, mult: 1.7, fx: 'shine', color: '#fff3e0', sparkle: '#ffe0b2' },
  { id: 'shiny', kind: 'power', name: 'Shiny', icon: '✦', oneIn: 80, mult: 1.5, fx: 'shine', color: '#ffffff', sparkle: '#ffffff' },
  // flavour
  { id: 'titans', kind: 'flavour', name: 'Titan\'s', icon: '🗿', oneIn: 8000, mult: 1.5, aff: { bossDmg: 40, hpP: 20, armor: 5 }, fx: 'shine', color: '#ffccbc' },
  { id: 'soulbound', kind: 'flavour', name: 'Soulbright', icon: '✦', oneIn: 3000, mult: 1.4, aff: { soulFind: 25, xp: 20 }, fx: 'shine', color: '#d1c4e9' },
  { id: 'blessed', kind: 'flavour', name: 'Blessed', icon: '✟', oneIn: 600, mult: 1.3, aff: { gold: 40, xp: 40, loot: 25 }, fx: 'shine', color: '#ffe9a8' },
  { id: 'nimble', kind: 'flavour', name: 'Nimble', icon: '🍃', oneIn: 400, mult: 1.2, aff: { dodge: 4, multi: 5 }, fx: 'shine', color: '#c8e6c9' },
  { id: 'vampiric', kind: 'flavour', name: 'Vampiric', icon: '🩸', oneIn: 250, mult: 1.2, aff: { leech: 4 }, fx: 'shine', color: '#ff9a9a' },
  { id: 'swift', kind: 'flavour', name: 'Swift', icon: '💨', oneIn: 250, mult: 1.2, aff: { spd: 20 }, fx: 'shine', color: '#bff7ff' },
  { id: 'keen', kind: 'flavour', name: 'Keen', icon: '🎯', oneIn: 200, mult: 1.2, aff: { crit: 8, critD: 30 }, fx: 'shine', color: '#ffd1f0' },
  { id: 'lucky', kind: 'flavour', name: 'Lucky', icon: '🍀', oneIn: 200, mult: 1.2, aff: { gold: 30, loot: 20 }, fx: 'shine', color: '#b9ffb0' },
  { id: 'razor', kind: 'flavour', name: 'Razor', icon: '🗡', oneIn: 180, mult: 1.15, aff: { critD: 25, atkP: 4 }, fx: 'shine', color: '#eceff1' },
  { id: 'hardy', kind: 'flavour', name: 'Hardy', icon: '🧱', oneIn: 150, mult: 1.15, aff: { armor: 4, hpP: 5 }, fx: 'shine', color: '#d7ccc8' },
];
// modifiers are worth floors of depth too (see RARITY_POWER)
{ const P = MODIFIERS.find(m => m.id === 'paragon'); for (const m of MODIFIERS) if (m.kind === 'flavour' && m !== P) for (const [k, v] of Object.entries(m.aff || {})) P.aff[k] = (P.aff[k] || 0) + v; }
const MODIFIER_POWER = { paragon: 30, voidkissed: 80, starforged: 68, prismatic: 56, brilliant: 51, radiant: 46, luminous: 42, glowing: 38, sparkling: 30, gleaming: 25, shiny: 20,
  titans: 24, soulbound: 20, blessed: 16, nimble: 14, vampiric: 13, swift: 13, keen: 12, lucky: 12, razor: 11, hardy: 10 };
MODIFIERS.forEach(m => { m.oldMult = m.mult; m.mult3 = Math.pow(OLD_ITEM_FLOOR_GROWTH, MODIFIER_POWER[m.id]); m.mult = cs(m.mult3); m.floors = floorsWorth(m.mult); });

const SLOTS = {
  // display order in the Hero and Forge panels
  weapon: { icon: '⚔', names: ['Sword', 'Axe', 'Longbow', 'Staff', 'Dagger', 'Mace', 'Spear', 'Wand', 'Hammer'] },
  helm: { icon: '⛑', names: ['Helm', 'Crown', 'Hood', 'Circlet', 'Visor', 'Greathelm', 'Cowl'] },
  armor: { icon: '🛡', names: ['Plate', 'Chainmail', 'Robe', 'Leathers', 'Cuirass', 'Vestments', 'Brigandine'] },
  trinket: { icon: '💍', names: ['Ring', 'Band', 'Charm', 'Talisman', 'Idol', 'Signet', 'Sigil'] },
};
// main stats per slot at item level 1, before rarity/modifiers
const SLOT_BASE = { weapon: { atk: 6 }, armor: { hp: 45 }, trinket: { atk: 3, hp: 20 }, helm: { atk: 1.5, hp: 28 } };
const PREFIXES = [
  ['Rusty', 'Worn', 'Plain', 'Crude', 'Dented'],
  ['Sturdy', 'Honed', 'Polished', 'Balanced', 'Reinforced'],
  ['Gleaming', 'Runed', 'Blazing', 'Frozen', 'Vicious'],
  ['Ancient', 'Cursed', 'Luminous', 'Stormforged', 'Bloodbound'],
  ['Dragonbone', 'Sunfire', 'Kingslayer', 'Warlord', 'Starfallen'],
  ['Void-Touched', 'Godforged', 'Worldender', 'Abyssal', 'Nightmare'],
  ['Hallowed', 'Seraphic', 'Sanctified', 'Divine', 'Heavenbound'],
  ['Starborn', 'Astral', 'Celestial', 'Moonforged', 'Constellation'],
  ['Nebular', 'Galaxy-Eater', 'Singularity', 'Cosmic', 'Supernova'],
  ['Primordial', 'First-Light', 'Genesis', 'Timeless', 'Origin'],
  ['Ethereal', 'Wraithlight', 'Dreamwoven', 'Spectral', 'Veilborn'],
  ['Ascendant', 'Exalted', 'Apotheotic', 'Skyward', 'Enlightened'],
  ['Transcendent', 'Beyond-Mortal', 'Otherworldly', 'Ineffable', 'Sublime'],
  ['Eternal', 'Everlasting', 'Undying', 'Aeonic', 'Perpetual'],
  ['Infinite', 'Boundless', 'Endless', 'Limitless', 'Unending'],
  ['Absolute', 'Omnipotent', 'Supreme', 'Paramount', 'Ultimate'],
];
const SUFFIXES = ['of the Bear', 'of Haste', 'of the Fox', 'of Embers', 'of the Deep', 'of Ruin', 'of Fortune', 'of the Sage', 'of the Wolf', 'of the Moon'];
const AFFIXES = {
  atkP: { name: '% Attack', min: 4, max: 12 },
  hpP: { name: '% Health', min: 4, max: 12 },
  crit: { name: '% Crit Chance', min: 1, max: 4 },
  critD: { name: '% Crit Damage', min: 8, max: 25 },
  spd: { name: '% Attack Speed', min: 2, max: 6 },
  gold: { name: '% Gold Find', min: 5, max: 20 },
  xp: { name: '% XP Gain', min: 5, max: 20 },
  loot: { name: '% Loot Chance', min: 3, max: 10 },
  leech: { name: '% Lifesteal', min: 0.5, max: 2, cap: 25 },         // heals from real damage dealt (no overkill)
  // gear-only stats (no upgrade or perk gives these). cap = hard limit on the hero's total
  dodge: { name: '% Dodge', min: 0.5, max: 2.5, cap: 60 },          // chance to avoid a hit
  armor: { name: '% Armor', min: 1, max: 4, cap: 75 },              // damage taken reduced by this %
  regen: { name: '% HP Regen/s', min: 0.2, max: 0.8 },               // heal this % of max HP per second
  multi: { name: '% Multistrike', min: 2, max: 6, cap: 100 },       // chance to hit twice
  splash: { name: '% Splash', min: 3, max: 12, cap: 50 },           // this % of each hit also hits the next enemy
  bossDmg: { name: '% Boss Damage', min: 5, max: 20 },
  soulFind: { name: '% Soul Find', min: 2, max: 8 },                // more souls when you rebirth
};
// the best rolls are 50% higher than they used to be (stats with a cap on your total keep their old max)
for (const A of Object.values(AFFIXES)) if (!A.cap) A.max = Math.round(A.max * 1.5 * 10) / 10;

// ---------- amulets: rare boss drops with their own tiers ----------
// One amulet is worn at a time, kept through rebirths. Its bonuses are multipliers that don't depend on
// depth, so only the tier (and roll) matters and a good amulet never goes out of date.
// power scales every bonus; charms = extra bonus types at half strength.
const AMULET_CHANCE = 0.03;  // per boss kill (Trophy Hunter raises it)
const AMULET_TIERS = [
  { name: 'Chipped', color: '#9fb4c7', w: 400, power: 1, charms: 0 },
  { name: 'Polished', color: '#7fe0a0', w: 250, power: 1.6, charms: 0 },
  { name: 'Enchanted', color: '#6fb6ff', w: 160, power: 2.4, charms: 1 },
  { name: 'Runic', color: '#b87dff', w: 100, power: 3.4, charms: 1 },
  { name: 'Ancient', color: '#ffb347', w: 55, power: 4.8, charms: 2 },
  { name: 'Starbound', color: '#6ff0ff', w: 25, power: 6.6, charms: 2, shine: true },
  { name: 'Worldsoul', color: '#7dffc0', w: 8, power: 9, charms: 3, shine: true },
  { name: 'Godheart', color: '#ff6ad5', w: 2, power: 13, charms: 4, shine: true, rainbow: true },
  { name: 'Primeval', color: '#3dffb0', w: 0.5, power: 18, charms: 5, shine: true, rainbow: true },
  { name: 'Worldbreaker', color: '#ff7043', w: 0.1, power: 25, charms: 6, shine: true, rainbow: true },
  { name: 'Eternity', color: '#f4f4ff', w: 0.02, power: 35, charms: 7, shine: true, rainbow: true },
];
// per = bonus per point of power (×(1 + per × power)); w = how much it counts when comparing amulets
const AMULET_STATS = {
  atk: { name: 'Might', desc: 'damage', per: 0.1, w: 1 },
  hp: { name: 'Vigor', desc: 'health', per: 0.14, w: 0.5 },
  critD: { name: 'Wrath', desc: 'crit damage', per: 0.16, w: 0.6 },
  spd: { name: 'Haste', desc: 'attack speed', per: 0.05, w: 0.9 },
  boss: { name: 'the Titan', desc: 'boss damage', per: 0.22, w: 0.35 },
  gold: { name: 'Avarice', desc: 'gold', per: 0.25, w: 0.3 },
  xp: { name: 'Insight', desc: 'XP', per: 0.25, w: 0.3 },
  loot: { name: 'Fortune', desc: 'loot', per: 0.15, w: 0.3 },
  souls: { name: 'Souls', desc: 'souls from rebirths', per: 0.08, w: 0.4 },
};

// ---------- enemy traits: behaviours any monster can roll (not bosses) ----------
const TRAITS = [
  { id: 'elite', name: 'Elite', icon: '👑', w: 10, hp: 4, atk: 1.6, reward: 4, scale: 1.3, desc: 'Big, tough, and drops 4× rewards' },
  { id: 'shielded', name: 'Shielded', icon: '🛡', w: 12, desc: 'A shield absorbs damage before its health' },
  { id: 'splitter', name: 'Splitter', icon: '✂', w: 10, desc: 'Splits into two smaller copies when killed' },
  { id: 'bomber', name: 'Bomber', icon: '💣', w: 8, hp: 0.6, desc: 'Rushes in and explodes for huge damage' },
  { id: 'summoner', name: 'Summoner', icon: '🔮', w: 7, hp: 1.2, desc: 'Keeps summoning minions' },
  { id: 'berserker', name: 'Berserker', icon: '😡', w: 10, desc: 'Hits harder and faster the more it is hurt' },
  { id: 'regen', name: 'Regenerator', icon: '♻', w: 10, desc: 'Regenerates health quickly' },
  { id: 'charger', name: 'Charger', icon: '⚡', w: 9, desc: 'Its first hit is doubled and stuns you' },
  // (depth pass) more behaviours
  { id: 'vampiric', name: 'Vampiric', icon: '🦇', w: 8, desc: 'Heals 6% of its health every time it hits you' },
  { id: 'armored', name: 'Armored', icon: '🪨', w: 8, desc: 'Takes 40% less damage, except from critical hits' },
  { id: 'swift', name: 'Swift', icon: '💨', w: 9, hp: 0.7, desc: 'Fragile, but moves and attacks 60% faster' },
  { id: 'ghostly', name: 'Ghostly', icon: '👻', w: 7, desc: 'A quarter of your attacks pass right through it' },
  { id: 'toxic', name: 'Toxic', icon: '☣', w: 7, desc: 'Bursts into a poison cloud when killed (2% of your health per second for 3s)' },
  { id: 'colossal', name: 'Colossal', icon: '⛰', w: 5, hp: 2.5, atk: 1.3, reward: 2.5, scale: 1.5, desc: 'Huge and slow to fall, 2.5× rewards' },
];
// from the second lap, some trait monsters are Champions: they roll a second trait, and pay CHAMPION.reward × more
const CHAMPION = { fromLap: 1, chance: 0.15, reward: 2, hp: 1.5 };

// ---------- gold upgrades (reset on rebirth) ----------
const CORE_UPG = 1.06;
const UPGRADES = {
  // `mult`: each level multiplies the stat by this (compounding); upgrades without it add flat amounts
  // costs grow gently (≈ the old ×1.6–1.9 growth to the 1/5 power) so gold stays in readable numbers;
  // gold per floor shrank the same way (GOLD_FLOOR_GROWTH), so upgrades still keep pace with depth.
  // Greed and Wisdom feed back into income, so they shrank too (a ×1.10 Greed would outgrow its own cost).
  // combat mults are the old ×1.10 / ×1.20 run through cs() (see COMBAT_SCALE)
  // `at` = best floor that unlocks the upgrade (they show up one by one so a new game isn't a wall of buttons)
  // `mastery`: once maxed, an upgrade keeps levelling as ✪ Mastery (cost ×MASTERY_GROWTH per level),
  // each level multiplying a core stat, so capped upgrades stay worth buying at any depth
  // Sharpen & Toughen are the core upgrades: ×CORE_UPG per level (was cs(1.1) ≈ ×1.019, which let gear alone carry a
  // run). Enemies grow faster per floor to match (see ENEMY_HP_GROWTH), so skipping upgrades now hits a wall early
  damage:     { name: 'Sharpen', icon: '⚔', desc: `×${CORE_UPG} damage per level`, mult: CORE_UPG, base: 20, growth: 1.101, at: 1 },
  health:     { name: 'Toughen', icon: '❤', desc: `×${CORE_UPG} health per level`, mult: CORE_UPG, base: 20, growth: 1.101, at: 1 },
  // max 30 ≈ enough to reach the attack speed cap (it used to go to 500 while speed capped after ~30); then ✪ Mastery
  speed:      { name: 'Haste', icon: '⚡', desc: '×1.03 attack speed per level', mult: 1.03, base: 120, growth: 1.118, max: 30, at: 3, mastery: { atk: cs(1.03) } },
  // Greed & Wisdom add a flat % per level (`lin`) instead of compounding: compounding Greed fed itself
  // (more gold → more Greed → more gold), which made the hero outgrow every wall
  gold:       { name: 'Greed', icon: '💰', desc: '+3% gold per level', mult: 1.02, lin: 0.03, base: 60, growth: 1.112, at: 5 },
  critChance: { name: 'Precision', icon: '✦', desc: '+1% crit chance (past 100%, it becomes crit damage)', base: 150, growth: 1.118, max: 92, at: 8, mastery: { critD: cs(1.05) } },
  xp:         { name: 'Wisdom', icon: '📘', desc: '+3% XP per level', mult: 1.02, lin: 0.03, base: 60, growth: 1.112, at: 12 },
  // (was ×cs(1.1) ≈ 1.019 per level: with crit chance at 100% it acted like a second Sharpen)
  critDmg:    { name: 'Brutality', icon: '💥', desc: '×1.010 crit damage per level', mult: 1.01, base: 120, growth: 1.115, at: 16 },
  loot:       { name: 'Fortune', icon: '🍀', desc: '×1.06 loot drops per level', mult: 1.06, base: 250, growth: 1.125, at: 20 },
  leech:      { name: 'Vampirism', icon: '🩸', desc: '+0.5% lifesteal (all lifesteal is capped at 25%)', base: 800, growth: 1.125, max: 50, at: 25, mastery: { hp: cs(1.03) } },
  // `add`: each level adds this much to a gear stat (the stat's usual cap still applies)
  recovery:   { name: 'Recovery', icon: '💗', desc: '+0.05% health regen per second', add: { regen: 0.05 }, base: 300, growth: 1.125, max: 40, at: 30, mastery: { hp: cs(1.03) } },
  plating:    { name: 'Plating', icon: '🔩', desc: '+0.5% damage reduction (armor)', add: { armor: 0.5 }, base: 400, growth: 1.13, max: 60, at: 35, mastery: { hp: cs(1.03) } },
  giant:      { name: 'Giant Slayer', icon: '👹', desc: '+5% boss damage', add: { bossDmg: 5 }, base: 350, growth: 1.12, max: 100, at: 40, mastery: { boss: cs(1.1) } },
  siphon:     { name: 'Soul Siphon', icon: '✦', desc: '+2% souls from rebirths', add: { soulFind: 2 }, base: 1000, growth: 1.14, max: 100, at: 45, mastery: { souls: 1.02 } },
  evasion:    { name: 'Evasion', icon: '💨', desc: '+0.25% dodge', add: { dodge: 0.25 }, base: 500, growth: 1.13, max: 80, at: 55, mastery: { hp: cs(1.03) } },
  twinstrike: { name: 'Double Edge', icon: '🗡', desc: '+1% multistrike (chance to hit twice)', add: { multi: 1 }, base: 600, growth: 1.13, max: 50, at: 65, mastery: { atk: cs(1.03) } },
  sweep:      { name: 'Sweeping Blows', icon: '〰', desc: '+2% splash damage (splash is capped at 50%)', add: { splash: 2 }, base: 500, growth: 1.13, max: 25, at: 75, mastery: { atk: cs(1.03) } },
  // --- more defense ---
  regrowth:   { name: 'Regrowth', icon: '🌱', desc: 'Heal 0.2% of your max health on every kill', base: 1500, growth: 1.13, max: 20, at: 50, mastery: { hp: cs(1.03) } },
  thickskin:  { name: 'Thick Skin', icon: '🐢', desc: '-1% damage taken from bosses', base: 2000, growth: 1.13, max: 40, at: 60, mastery: { hp: cs(1.03) } },
  deflect:    { name: 'Deflect', icon: '🪞', desc: '-3% damage from ranged attacks', base: 2500, growth: 1.13, max: 25, at: 70, mastery: { hp: cs(1.03) } },
  // --- more loot ---
  prospector: { name: 'Prospector', icon: '⛏', desc: '+10% gold from selling items', base: 800, growth: 1.12, at: 40 },
  chesthunter: { name: 'Chest Hunter', icon: '🎁', desc: 'Treasure chests +1% more often and +2% more gold', base: 1000, growth: 1.13, max: 50, at: 45, mastery: { gold: 1.01 } },
  keeneye:    { name: 'Keen Eye', icon: '👁', desc: '+2% chance for item modifiers (Shiny, Keen…)', base: 3000, growth: 1.14, max: 50, at: 80, mastery: { gold: 1.01 } },
};
for (const U of Object.values(UPGRADES)) if (U.at > 1) U.at = Math.round(U.at * UNLOCK_PACE);
// tabs in the Upgrades panel
const UPG_TABS = {
  off: { name: '⚔ Offense', keys: ['damage', 'speed', 'critChance', 'critDmg', 'giant', 'twinstrike', 'sweep'] },
  def: { name: '❤ Defense', keys: ['health', 'leech', 'recovery', 'plating', 'regrowth', 'evasion', 'thickskin', 'deflect'] },
  eco: { name: '💰 Loot', keys: ['gold', 'xp', 'loot', 'prospector', 'chesthunter', 'siphon', 'keeneye'] },
};
const MASTERY_GROWTH = 1.105;
const MASTERY_NAMES = { atk: 'damage', hp: 'health', critD: 'crit damage', boss: 'boss damage', souls: 'souls', gold: 'gold' };
// other features that unlock as you go deeper (best floor), so the start stays simple
const FEATURES = {
  chests: { at: 3, name: '🎁 Treasure chests now wander in' },
  cookies: { at: 6, name: '🍪 Golden cookies can now appear. Click them!' },
  // the Forge is a late-mid-game system now (was floor 15)
  forge: { at: 120, name: '⚒ Forge unlocked: reinforce, reforge and temper your gear (sold Rare+ items now give 🔩 scrap)' },
  rebirth: { at: 20, name: `✦ Rebirth unlocked (from floor ${30})` },
  autoUpg: { at: 25, name: '⬆ Auto-buy unlocked (Upgrades panel). It starts off with every upgrade excluded: tap A to include one' },
  chestShop: { at: 135, name: '📦 Scrap chests in the Forge' },
  autoForge: { at: 160, name: '⚒ Auto-reinforce unlocked (Forge panel)' },
};
// removed features: upgrades/perks are refunded and gear stats stripped on load
const REMOVED_UPGRADES = { cleave: { base: 500, growth: 1.137 } }, REMOVED_AFFIXES = ['execute', 'cdr', 'thorns'];
const REMOVED_PERKS = {};  // (Head Start was here: removed once, refunded, now back as a new perk)

// ---------- the Forge: other things to spend gold on ----------
// Reinforce: levels per gear slot, multiplying the main stats of whatever you wear there.
// Resets on rebirth and Awakening like the gold upgrades (it used to be kept through rebirths; changed on request).
// (was ×1.015 per level for 100 × 1.6^lvl gold from floor 15; now later, pricier and much stronger per level)
const FORGE = { mult: 1.05, base: 25000, growth: 1.45 };
// 🔩 Scrap: a Forge material from every Rare-or-better item you sell (kept through rebirths), so the Forge doesn't
// compete with auto-buy for gold. (Reforge and the Mystery Chest used to cost minutes of gold income.)
// perRarity = scrap per sold item by rarity tier; modifiers add a bonus
// v2 (user opened ~100 Cosmic chests by floor 182 and got a 1-in-213B item): scrap is now scarce: only Epic+ items
// give any, amounts grow slowly with rarity, and each modifier adds a flat +1 (was ×(1 + 2 per modifier)).
// (was [0,0,1,3,8,20,50,120,300,700,1500,…])
// (27 Sep: Rare items give scrap too, and higher rarities much more; was [0,0,0,1,1,2,3,4,6,8,9,10,12,15,18,20]. Items found
// on replays give a quarter of this, which is where most scrap used to come from. A chest's items still sell for far less
// scrap than the chest costs, so there's no loop.)
const SCRAP = { perRarity: [0, 0, 1, 2, 3, 5, 8, 12, 20, 30, 60, 100, 175, 300, 500, 1000], mod: 1, version: 2 };
// items found on floors below your best (replays after a rebirth, Blitz) give only this share of their scrap when sold,
// so rebirthing over and over isn't a scrap farm (fractions round up by chance, so a 1-scrap item gives 1 a quarter of the time)
const REPLAY_SCRAP = 0.25;
// Reforge: reroll a worn item's bonus stats, then keep the new roll or revert. Cost grows with rarity and each reforge
const REFORGE = { base: 1, growth: 1.15 };
// Temper: bring a worn item up to the current floor's item level (keeps rarity, modifiers, set and bonus stats)
const TEMPER = { base: 1 };
// scrap chests: an item with a rarity of at least minR (and at most maxR, if set), at CHEST_ILVL of this floor's item
// level. Each one bought makes the next of that kind ×CHEST_GROWTH pricier for the rest of the run.
// Chest items roll like boss drops (best of two rarity rolls, ×2 modifier chance), × their own `mod` on top (Bronze ×1.5 …
// Cosmic ×15), and a modifier they get always lands on one of the CHEST_TOP_MODS rarest (Void-Kissed … Radiant, Paragon … Nimble).
// The big chests' modifier chance is maxed out late anyway, so the bonus also buys better picks among those: a chest picks
// ceil(mod ÷ CHEST_PICK_PER) times and keeps the rarest (Celestial ×10: best of 2, Cosmic ×15: best of 3; ×5 and under: 1).
const CHEST_PICK_PER = 5;
// Celestial and Cosmic have no max: anything above rolls with the normal rarity weights, and the jackpot tiers
// (Ethereal and up) ×CHEST_JACKPOT on top, so a Cosmic chest gives Ethereal ~1 in 1,800 and Ascended ~1 in 18,000.
// (27 Sep: the 26 Sep nerf capped every chest and removed modifier bonuses, which made them not worth buying:
// in a 17.6h sim, 3/400 tempered Cosmic chest items beat the worn gear)
const CHEST_ILVL = 0.8, CHEST_GROWTH = 1.3, CHEST_JACKPOT = 0.2, CHEST_TOP_MODS = 5;
const SCRAP_CHESTS = {
  bronze: { name: 'Bronze Chest', icon: '🟫', cost: 100, minR: 2, maxR: 3, mod: 1.5, desc: 'Rare or Epic' },
  silver: { name: 'Silver Chest', icon: '⬜', cost: 400, minR: 3, maxR: 4, mod: 2, desc: 'Epic or Legendary' },
  gold: { name: 'Gold Chest', icon: '🟨', cost: 1500, minR: 4, maxR: 5, mod: 2.5, desc: 'Legendary or Mythic' },
  platinum: { name: 'Platinum Chest', icon: '⬛', cost: 6000, minR: 5, maxR: 6, mod: 3.5, desc: 'Mythic or Divine' },
  diamond: { name: 'Diamond Chest', icon: '💠', cost: 25000, minR: 6, maxR: 7, mod: 4.5, desc: 'Divine or Celestial' },
  // attune: rolls that many items and gives you the one that improves your current gear the most (compared as if tempered)
  celestial: { name: 'Celestial Chest', icon: '🌠', cost: 100000, minR: 7, mod: 10, attune: 3, desc: 'Celestial or better (rarely much better)' },
  cosmic: { name: 'Cosmic Chest', icon: '🌌', cost: 400000, minR: 8, mod: 15, attune: 5, desc: 'Cosmic or better (rarely much better)' },
  // 🔷 from lap 5; also costs Essence (see ESSENCE_CHEST), which sets its rarity
  essence: { name: 'Essence Chest', icon: '🔷', cost: 500000, minR: 9, mod: 15, attune: 5, lap: 5, essence: true, desc: 'Costs Essence too: the more you sacrifice, the rarer it gets' },
};
// 🔷 Essence Chest: costs `share` of your Essence (at least 1). The Essence spent sets the lowest rarity:
// level = log10(1 + spent ÷ per): every 10× more Essence is one tier more. The item is exactly `base` (Primordial) + whole
// levels, or one tier higher with the fraction as its chance (never higher than that). 1,000 Essence: Ethereal; 10K:
// Ascended; 100K: Transcendent; 1M: Eternal; 10M: Infinite; 100M: Absolute.
// (Tried first: a log2 scale with per 10, where 10% of a lap-5 Essence pool bought a guaranteed Absolute; then log10 with
// "or better", where the boss double roll and the best-of-5 pick pushed most items to Infinite: a ×278 median upgrade.)
const ESSENCE_CHEST = { share: 0.1, per: 100, base: 9 };
FEATURES.essenceChest = { at: 4 * FLOORS_PER_ZONE * ZONES.length + 1, name: '🔷 Essence Chest unlocked (⚒ Forge → 📦 Chests): sacrifice Essence for a far rarer item' };
// Mystery Chest: buy a boss-quality item for the current floor. Price = minutes of income, and rises
// with every chest bought this run
const CHEST_SHOP = { minutes: 2, growth: 1.15 };
// treasure chests: gold = `minutes` of income; how much Chest Magnet (per perk level), Chest Hunter (per upgrade
// level) and the Treasure Map add to how often they come and how much they hold.
// (was 1.5 min, magnet +15%/+20%, hunter +2%/+5%, map ×2: fully stacked that was a chest every ~15s worth ~16 min of income)
const CHEST = { minutes: 0.5, magnetFreq: 0.1, magnetGold: 0.1, hunterFreq: 0.01, hunterGold: 0.02, mapFreq: 1.5 };
// gold & XP per floor of depth (were 1.13 / 1.12 / XP needed 1.14 per level: numbers reached e55)
const GOLD_FLOOR_GROWTH = 1.025, XP_FLOOR_GROWTH = 1.023, XP_LEVEL_GROWTH = 1.0265;
// economy version: saves below this get their gold rescaled on load
const ECON_VERSION = 2;

// ---------- golden cookies: [weight, id, text, effect] ----------
// effect: { buff: {stat: mult}, secs } | { gold: minutes of income } | special ids handled in code
const COOKIES = [
  [10, 'crumb', 'Just a crumb. Tasty, but useless.', {}],
  [6, 'penny', 'You found a penny! +1 gold.', { flatGold: 1 }],
  [4, 'meh', 'Your hero feels… about the same.', {}],
  [14, 'lucky', 'Lucky! A pile of gold.', { gold: 5 }],
  [12, 'frenzy', 'Frenzy! Gold ×7 for 77s', { buff: { gold: 7 }, secs: 77, icon: '💰', label: 'Frenzy' }],
  [8, 'study', 'Epiphany! XP ×5 for 60s', { buff: { xp: 5 }, secs: 60, icon: '📘', label: 'Epiphany' }],
  // damage buffs are sized for the compressed combat curve (worth the same floors of depth as an old ×5 / ×30)
  [12, 'fury', `Fury! Damage ×${cs(5).toFixed(2)} for 45s`, { buff: { atk: cs(5) }, secs: 45, icon: '⚔', label: 'Fury' }],
  [10, 'haste', 'Adrenaline! Attack speed ×2 for 45s', { buff: { spd: 2 }, secs: 45, icon: '⚡', label: 'Adrenaline' }],
  [6, 'treasure', 'Treasure sense! Loot ×5 for 60s', { buff: { loot: 5 }, secs: 60, icon: '🍀', label: 'Treasure' }],
  [5, 'gift', 'A gift! A rare item appears.', { item: true }],
  [5, 'warp', 'Shortcut! Skipped 3 floors.', { warp: 3 }],
  [2, 'dragon', `DRAGONFLIGHT! Damage ×${cs(30).toFixed(2)} for 20s`, { buff: { atk: cs(30) }, secs: 20, icon: '🐉', label: 'Dragonflight' }],
  [2, 'jackpot', 'JACKPOT! A mountain of gold.', { gold: 60 }],
  [1, 'soul', 'Soul crumb! Free souls.', { souls: true }],
  [2, 'gem', 'A glittering gem!', { gems: true }],
  // (depth pass) buffs: mod = × modifier chance, boss = × boss damage, def = × damage taken
  [5, 'clover', 'Four-leaf clover! Modifier chance ×3 for 60s', { buff: { mod: 3 }, secs: 60, icon: '☘', label: 'Clover' }],
  [5, 'giant', 'Giant\'s strength! Boss damage ×3 for 60s', { buff: { boss: 3 }, secs: 60, icon: '👹', label: 'Giant' }],
  [5, 'iron', 'Iron skin! You take half damage for 60s', { buff: { def: 0.5 }, secs: 60, icon: '🪨', label: 'Iron skin' }],
  [4, 'double', 'Double cookie! Two treats in one.', { double: true }],
  [4, 'scrapc', 'A scrap cookie. Crunchy!', { scrap: 8 }],
  [3, 'treat', 'Pet treat! Your pet gains experience.', { petXp: 4 }],
  [2, 'stardustc', 'Stardust sprinkles!', { dust: 10 }],
  [1, 'amuletc', 'Something glints in the crumbs… an amulet!', { amulet: true }],
];

// ---------- 💎 gems: a permanent third currency (never resets) ----------
// earned from progress, not farming: the first clear of each boss floor (1 + 1 per 100 floors of depth),
// every achievement, a rare golden cookie and the odd treasure chest.
// spent on skill training (ranks) and relics (one-time unlocks)
// v2 (user: too easy to get, too strong): was 2/achievement, every boss floor (1 + 1 per 100 floors), 4% of chests,
// 1–3 per cookie, ranks +25% for 3–48, relics 40–150
const GEMS = { perAch: 1, chestChance: 0.02, cookie: 1, version: 2 };
// only the zone-ending bosses (every 20 floors) pay gems: 1, plus 1 more per 200 floors of depth
const gemsForBoss = f => f % FLOORS_PER_ZONE === 0 ? 1 + Math.floor(f / 200) : 0;
// skill ranks: each rank +15% skill power (damage for attacks, duration for War Cry / Battle Fury, stun length for Bash)
// ranks 6–10 (depth pass) add +10% each (power2), and rank 10 evolves the skill (SKILL_EVO)
const SKILL_RANKS = { max: 10, power: 0.15, power2: 0.1, cost: [10, 20, 40, 80, 160, 250, 350, 500, 700, 1000] };
// ✦ evolutions: what each skill gains at its highest rank
const SKILL_EVO = {
  cleave: { name: 'Rending Cleave', desc: 'Everything it hits also bleeds for 100% damage over 3s' },
  rend: { name: 'Hemorrhage', desc: 'The bleed spreads to every enemy in reach' },
  bash: { name: 'Earthshaker', desc: 'Stuns bosses too, for half as long' },
  execute: { name: 'Guillotine', desc: 'Instantly kills monsters under 45% health (was 30%)' },
  thunder: { name: 'Chain Lightning', desc: 'Jumps to 3 more enemies for half damage' },
  warcry: { name: 'Rallying Cry', desc: 'You also deal 25% more damage while it lasts' },
  whirlwind: { name: 'Cyclone', desc: 'Spins for 10 hits instead of 6' },
  slam: { name: 'Aftershock', desc: 'A second shockwave hits 1s later for 100% damage' },
  fury: { name: 'Bloodlust', desc: 'Your attacks deal +100% damage instead of +60%' },
};
const RELICS = {
  cookieJar: { name: 'Cookie Jar', icon: '🍪', cost: 60, desc: 'Golden cookies eat themselves a couple of seconds after they appear' },
  map: { name: 'Treasure Map', icon: '🗺', cost: 80, desc: 'Treasure chests wander in 50% more often' },
  mark: { name: 'Hunter\'s Mark', icon: '👑', cost: 150, desc: 'Bosses drop one more item and are 50% more likely to drop an amulet' },
  twin: { name: 'Twin Chains', icon: '📿', cost: 400, desc: 'Wear a second amulet: your two best amulets both count' },
};

// ---------- rebirth perks (cost in souls) ----------
// The flat perks (Wisdom, Hunter, Slayer) also multiply by PERK_COMPOUND per level on top of their flat bonus.
// steepFrom/steep: levels from `steepFrom` on cost an extra ×steep each (the later Refined Taste levels)
// `at` = best floor that reveals the perk
const PERK_COMPOUND = 1.02;
const DREAM_PER = 0.025, OFFLINE_BASE = 0.4, OFFLINE_MAX = 0.9;  // offline efficiency: base + Dream Walker (+ Hourglass), capped
const HEADSTART_PER = 4;  // % of upgrade levels kept / of best floor skipped, per Head Start level (was 6: made runs 2–3 snowball)
const PERKS = {
  soul: { name: 'Soul Power', desc: `×${cs(1.1).toFixed(3)} Attack & Health per level`, base: 1, growth: 1.25, at: 30 },
  // back by request, stronger: it used to only move your starting floor (which Blitz makes nearly worthless); now each
  // level also keeps that share of your upgrade levels through the rebirth, and you bank the skipped floors' gold & XP
  headstart: { name: 'Head Start', desc: `Per level: keep ${HEADSTART_PER}% of your upgrade levels when you rebirth, and start ${HEADSTART_PER}% of your best floor deeper (collecting the gold & XP of the floors you skip)`, base: 10, growth: 2.6, max: 12, at: 40 },  // price ×2.6 per level (was ×2): 10 … ~8K, ~13K for 8; max 8 → 12 on request (levels 9–12: ~21K, 54K, 141K, 367K)
  // (was 2 × 1.4 per level: too good early on)
  scholar: { name: 'Ancient Wisdom', desc: `+30% XP, and ×${PERK_COMPOUND} XP per level`, base: 6, growth: 1.65, at: 30 },
  hunter: { name: 'Treasure Hunter', desc: `+20% Loot chance, and ×${PERK_COMPOUND} loot per level`, base: 3, growth: 1.5, at: 30 },
  slayer: { name: 'Boss Slayer', desc: `+30% damage to bosses and ×${PERK_COMPOUND} per level, +5s boss timer`, base: 3, growth: 1.5, max: 60, at: 30 },
  companion: { name: 'Spirit Companion', desc: 'A ghostly ally fights beside you, striking the front enemy every second for 8% of your attack per level', base: 6, growth: 1.7, max: 25, at: 35 },
  sweet: { name: 'Sweet Tooth', desc: 'Golden cookies show up 15% more often per level, and the useless ones get rarer', base: 5, growth: 1.8, max: 25, at: 40 },
  magnet: { name: 'Chest Magnet', desc: 'Treasure chests wander in 10% more often per level and hold 10% more gold', base: 5, growth: 1.8, max: 25, at: 40 },
  relentless: { name: 'Relentless', desc: 'Retry a failed push sooner (180s → 90s → 45s → 20s → 10s)', base: 5, growth: 2, max: 4, at: 50 },
  // (was +15% × 4 levels) more, smaller levels; offline efficiency never goes past OFFLINE_MAX
  dream: { name: 'Dream Walker', desc: `+${DREAM_PER * 100}% offline efficiency per level (base 40%, max ${OFFLINE_MAX * 100}%)`, base: 4, growth: 1.6, max: 20, at: 50 },
  trophy: { name: 'Trophy Hunter', desc: 'Bosses are 25% more likely per level to drop an amulet', base: 10, growth: 1.9, max: 20, at: 60 },
  phoenix: { name: 'Phoenix Feather', desc: 'Once per floor, cheat death and rise again with 25% health per level', base: 25, growth: 2.6, max: 4, at: 80 },
  // each level is a 20% chance per drop of one more item (was a guaranteed +1, which snowballed: 6 levels = 7 items)
  bounty: { name: 'Bountiful', desc: 'Each loot drop has a +20% chance per level to give an extra item', base: 15, growth: 2.2, max: 30, at: 100 },
  // was base 25 × 4 per level (≈8.5K souls for 5 levels = every drop Legendary+ after one rebirth); now 2K × 20
  // (was 25 × 4, then 2K × 20; now 10K × 60 per level: 10K, 600K, 36M, 2.2B, …)
  refine: { name: 'Refined Taste', desc: 'Removes the lowest rarity from the drop pool (Common first)', base: 10000, growth: 60, max: 7, steepFrom: 6, steep: 1e9, at: 150 },
};
const REBIRTH_MIN_FLOOR = 30;
const BOUNTY_VERSION = 2;  // saves below this get their Bountiful souls refunded (the perk was reworked)
const OLD_BOUNTY = { base: 15, growth: 2.4, steepFrom: 10, steep: 100 };

// ---------- achievements: each one is a small permanent bonus, and many unlock a cosmetic ----------
// was +2% each with 57 achievements; now there are ~170, so each one is worth +1%
const ACH_BONUS = 0.01;  // +1% damage, health and gold per achievement (added up)
// cat = which tab it's listed under; prog(g) → [current, target] for a progress bar
const ACH_CATS = { progress: '🏰 Progress', combat: '⚔ Combat', loot: '🎲 Loot', misc: '🍪 Other' };
const ACHIEVEMENTS = [];
{
  const add = (cat, id, name, desc, test, cos, prog) => ACHIEVEMENTS.push({ cat, id, name, desc, test, cos, prog });
  // counter achievements: done at `k`, with a progress bar
  const num = (cat, id, name, desc, get, k, cos) => add(cat, id, name, desc, g => get(g) >= k, cos, g => [get(g), k]);
  const RN = i => RARITY[i].name, an = s => /^[AEIOU]/.test(s) ? 'an' : 'a', n = k => k.toLocaleString('en-US');
  const S = (g, k) => (g.stats[k] || 0), sub = (g, k, id) => ((g.stats[k] || {})[id] || 0);
  // --- progress: depth, zones, levels, rebirths, souls ---
  [[10, 'Into the Dark', 'dye_crimson'], [25, 'Delver', 'cape_red'], [50, 'Deep Diver', 'helm_bandana'], [100, 'Centurion', 'weapon_gold'],
    [200, 'Abyss Walker', 'aura_embers'], [350, 'Bottomless', 'cape_shadow'], [500, 'Half a Thousand', 'helm_crown'], [750, 'Worldsdeep', 'dye_void'], [1000, 'The Thousandth Floor', 'aura_rainbow'],
    [1500, 'Past the Edge', 'helm_flame'], [2000, 'Two Thousand Down', 'cape_void'], [3000, 'The Endless Stair', 'aura_storm']]
    .forEach(([f, nm, c]) => num('progress', 'floor' + f, nm, `Reach floor ${f}`, g => g.bestFloor, f, c));
  ZONES.forEach((z, i) => { if (i) num('progress', 'zone' + i, `Welcome to ${z.name.replace(/^The /, '')}`, `Reach the ${z.name} (floor ${i * FLOORS_PER_ZONE + 1})`, g => g.bestFloor, i * FLOORS_PER_ZONE + 1, ['pet_mushroom', 'pet_frog', 'pet_crab', null, 'dye_ember', null, 'pet_bird', null, 'weapon_emerald', null, 'helm_witch', 'dye_swamp', 'pet_bearcub', 'pet_drake', 'aura_celestial'][i - 1] || undefined); });
  const lap = FLOORS_PER_ZONE * ZONES.length;
  num('progress', 'lap2', 'Round Two', `Go through every zone and reach the Forgotten Crypt II (floor ${lap + 1})`, g => g.bestFloor, lap + 1, 'helm_antlers');
  num('progress', 'lap3', 'Third Time Around', `Reach the Forgotten Crypt III (floor ${2 * lap + 1})`, g => g.bestFloor, 2 * lap + 1, 'dye_bone');
  [[4, 'Fourth Descent'], [5, 'Five Laps Deep', 'aura_lap'], [7, 'Seventh Circle'], [10, 'Endless Delver', 'cape_lap']]
    .forEach(([k, nm, c]) => num('progress', 'lap' + k, nm, `Start lap ${k} of the dungeon (floor ${(k - 1) * lap + 1})`, g => g.bestFloor, (k - 1) * lap + 1, c));
  [[10, 'Getting Stronger'], [50, 'Seasoned', 'dye_frost'], [100, 'Veteran', 'helm_plume'], [250, 'Hero of Legend', 'aura_frost'], [500, 'Demigod', 'helm_halo'],
    [1000, 'Living Legend', 'aura_leaves'], [2000, 'Beyond Mortal', 'weapon_sun']]
    .forEach(([k, nm, c]) => num('progress', 'lvl' + k, nm, `Reach hero level ${k}`, g => S(g, 'maxLvl'), k, c));
  [[1, 'Born Again', 'pet_ghost'], [5, 'Cycle of Souls', 'aura_void'], [25, 'Eternal Return', 'dye_royal'], [100, 'Wheel of Ages', 'pet_dragon'], [250, 'Samsara', 'cape_ice'], [500, 'Unending', 'pet_eye']]
    .forEach(([k, nm, c]) => num('progress', 'rb' + k, nm, `Rebirth ${k} time${k > 1 ? 's' : ''}`, g => g.rebirths, k, c));
  [[1e3, 'Soul Collector'], [1e6, 'Soul Hoarder', 'aura_shadow'], [1e9, 'Soul Tycoon', 'dye_ocean'], [1e12, 'Keeper of Souls', 'cape_white']]
    .forEach(([k, nm, c]) => num('progress', 'souls' + k, nm, `Earn ${fmtBig(k)} souls in total from rebirths`, g => S(g, 'soulsEarned'), k, c));
  [[1e4, 'Big Rebirth'], [1e7, 'Grand Rebirth', 'helm_tophat']].forEach(([k, nm, c]) => num('progress', 'rbbig' + k, nm, `Get ${fmtBig(k)} souls from a single rebirth`, g => S(g, 'bestRebirth'), k, c));
  add('progress', 'skills', 'Master of Arms', 'Learn every skill', g => g.hero.lvl >= Math.max(...Object.values(SKILLS).map(s => s.lvl)), undefined, g => [Math.min(g.hero.lvl, Math.max(...Object.values(SKILLS).map(s => s.lvl))), Math.max(...Object.values(SKILLS).map(s => s.lvl))]);
  [[100, 'Shopaholic'], [1000, 'Big Spender'], [1e4, 'Upgrade Addict', 'weapon_ruby']].forEach(([k, nm, c]) => num('progress', 'upg' + k, nm, `Buy ${n(k)} upgrade levels in total`, g => S(g, 'upgBought'), k, c));
  num('progress', 'mastery10', 'Mastery', 'Get ✪10 Mastery on any upgrade', g => Math.max(0, ...Object.keys(UPGRADES).map(k => UPGRADES[k].max ? (g.upg[k] || 0) - UPGRADES[k].max : 0)), 10, 'aura_hearts');
  [[10, 'Soul Shopper'], [100, 'Perk Collector', 'helm_cat']].forEach(([k, nm, c]) => num('progress', 'perks' + k, nm, `Buy ${k} perk levels in total`, g => S(g, 'perkBought'), k, c));
  // --- combat ---
  [[100, 'First Blood', 'pet_rat'], [1000, 'Monster Masher', 'dye_emerald'], [1e4, 'Exterminator', 'pet_slime'], [1e5, 'Legion Breaker', 'weapon_bone'], [1e6, 'Million Slayer', 'pet_skull'], [1e7, 'Extinction Event', 'weapon_shadow']]
    .forEach(([k, nm, c]) => num('combat', 'kills' + k, nm, `Defeat ${n(k)} monsters`, g => S(g, 'kills'), k, c));
  [[1, 'Giant Killer', 'helm_horns'], [10, 'Boss Hunter', 'cape_blue'], [50, 'Crownbreaker', 'pet_bat'], [250, 'Tyrant\'s Bane', 'weapon_flame'], [1000, 'Kingslayer', 'cape_royal'], [5000, 'Regicide', 'cape_green']]
    .forEach(([k, nm, c]) => num('combat', 'boss' + k, nm, `Defeat ${n(k)} boss${k > 1 ? 'es' : ''}`, g => S(g, 'bossKills'), k, c));
  ZONES.forEach((z, i) => add('combat', 'bossz' + i, `${z.boss.name} Slain`, `Defeat ${z.boss.name}, lord of the ${z.name}`, g => sub(g, 'bossL', i) >= 1));
  ZONES.forEach((z, i) => add('combat', 'bossg' + i, `${z.guard.name.replace(/^The /, '')} Defeated`, `Defeat ${z.guard.name}, guardian of the ${z.name}`, g => sub(g, 'bossG', i) >= 1, i === 10 ? 'cape_nightmare' : undefined));
  num('combat', 'twinboss', 'Double Trouble II', 'Defeat both of a zone\'s bosses at once (from the second lap)', g => S(g, 'twinKills'), 1, 'helm_twin');
  TRAITS.forEach(t => num('combat', 'trait_' + t.id, `${t.name} Hunter`, `Defeat 100 ${t.name} monsters (${t.icon})`, g => sub(g, 'traitKills', t.id), 100, { elite: 'helm_flower', summoner: 'pet_spider', splitter: 'pet_jelly' }[t.id]));
  num('combat', 'traitall', 'Freak Show', 'Defeat 10,000 monsters with a trait', g => Object.values(g.stats.traitKills || {}).reduce((a, b) => a + b, 0), 1e4, 'aura_blood');
  [[1e4, 'Critical Thinking'], [1e6, 'Critical Mass', 'weapon_razor']].forEach(([k, nm, c]) => num('combat', 'crit' + k, nm, `Land ${n(k)} critical hits`, g => S(g, 'crits'), k, c));
  num('combat', 'dodge1000', 'Now You See Me', 'Dodge 1,000 attacks', g => S(g, 'dodges'), 1000);
  [[100, 'Executioner'], [1e4, 'Headsman', 'helm_skull']].forEach(([k, nm, c]) => num('combat', 'exec' + k, nm, `Execute ${n(k)} monsters (Execute's instant kill)`, g => S(g, 'executes'), k, c));
  [[1, 'Everyone Falls'], [50, 'Stubborn']].forEach(([k, nm]) => num('combat', 'death' + k, nm, `Fall in battle ${k} time${k > 1 ? 's' : ''}`, g => S(g, 'deaths'), k));
  [[1, 'Rise From the Ashes'], [100, 'Phoenix Lord', 'cape_phoenix']].forEach(([k, nm, c]) => num('combat', 'phoenix' + k, nm, `Be revived by Phoenix Feather ${k} time${k > 1 ? 's' : ''}`, g => S(g, 'phoenix'), k, c));
  [[1000, 'Blitzkrieg'], [1e5, 'Lightning Round', 'aura_lightning']].forEach(([k, nm, c]) => num('combat', 'blitz' + k, nm, `Blitz through ${n(k)} floors`, g => S(g, 'blitzed'), k, c));
  add('combat', 'flawless', 'Untouchable', 'Clear a boss floor without taking any damage', g => S(g, 'flawless') >= 1, 'dye_jade');
  add('combat', 'closecall', 'Close Call', 'Clear a floor with less than 5% health left', g => S(g, 'closeCall') >= 1);
  add('combat', 'speedboss', 'Speedrunner', 'Defeat a boss within 3 seconds of it showing up', g => S(g, 'fastBoss') >= 1);
  // --- loot ---
  [[2, 'Shiny Blue'], [3, 'Purple Reign', 'weapon_frost'], [4, 'Legendary!', 'cape_flame'], [5, 'Mythic Find', 'pet_wisp'], [6, 'Touched by Gods', 'aura_sparkle'],
    [7, 'Among the Stars', 'helm_wizard'], [8, 'Cosmic Luck', 'weapon_void'], [9, 'Primordial Power', 'pet_crystal'], [10, 'Beyond the Veil', 'aura_veil'], [11, 'Ascension', 'dye_gold'],
    [12, 'Transcendence', 'aura_divine'], [13, 'Forever', 'cape_eternal'], [14, 'To Infinity', 'weapon_infinite'], [15, 'Absolute Luck', 'helm_absolute']]
    .forEach(([r, nm, c]) => add('loot', 'rar' + r, nm, `Find ${an(RN(r))} ${RN(r)} item`, g => S(g, 'bestR') >= r, c));
  add('loot', 'mod1', 'Ooh, Shiny', 'Find an item with a modifier', g => S(g, 'mods') >= 1);
  add('loot', 'modglow', 'It Glows', 'Find a Glowing (or rarer) item', g => !!g.stats.glow, 'aura_glow');
  add('loot', 'moddouble', 'Double Trouble', 'Find an item with two modifiers', g => !!g.stats.double);
  add('loot', 'modprism', 'Taste the Rainbow', 'Find a Prismatic item', g => !!g.stats.prism, 'weapon_rainbow');
  MODIFIERS.filter(m => m.id !== 'prismatic').forEach(m => add('loot', 'mod_' + m.id, `${m.name} Find`, `Find ${an(m.name)} ${m.name} item ${m.icon}`, g => sub(g, 'modSeen', m.id) >= 1, { radiant: 'aura_sun', vampiric: 'dye_blood' }[m.id]));
  [[1000, 'Hoarder'], [1e4, 'Packrat'], [1e5, 'Loot Goblin', 'pet_goblin'], [1e6, 'Dragon\'s Hoard', 'aura_coins']].forEach(([k, nm, c]) => num('loot', 'items' + k, nm, `Find ${n(k)} items`, g => S(g, 'items'), k, c));
  [[50, 'Fashion Sense'], [250, 'Trend Setter'], [1000, 'Quick Change', 'cape_rainbow']].forEach(([k, nm, c]) => num('loot', 'equip' + k, nm, `Equip ${n(k)} upgrades`, g => S(g, 'equipped'), k, c));
  add('loot', 'am1', 'Lucky Charm', 'Find an amulet', g => S(g, 'amulets') >= 1);
  [[10, 'Charm Collector'], [50, 'Amulet Addict', 'pet_amulet'], [200, 'Jeweler']].forEach(([k, nm, c]) => num('loot', 'ams' + k, nm, `Find ${k} amulets`, g => S(g, 'amulets'), k, c));
  [1, 2, 3, 5, 6].forEach(r => add('loot', 'amt' + r, `${AMULET_TIERS[r].name} Charm`, `Find ${an(AMULET_TIERS[r].name)} ${AMULET_TIERS[r].name} (or better) amulet`, g => (g.stats.bestAm == null ? -1 : g.stats.bestAm) >= r, { 5: 'aura_stars', 6: 'dye_world' }[r]));
  add('loot', 'am4', 'Ancient Relic', `Find an ${AMULET_TIERS[4].name} (or better) amulet`, g => (g.stats.bestAm == null ? -1 : g.stats.bestAm) >= 4, 'aura_gold');
  add('loot', 'am7', 'Heart of a God', `Find a ${AMULET_TIERS[7].name} amulet`, g => (g.stats.bestAm == null ? -1 : g.stats.bestAm) >= 7, 'helm_godcrown');
  // --- other ---
  [[1, 'Cookie Monster'], [25, 'Sugar Rush', 'pet_chest'], [100, 'Baker\'s Dozen Dozen'], [250, 'Sweet Dreams'], [1000, 'Cookie Emperor', 'pet_cookie']]
    .forEach(([k, nm, c]) => num('misc', 'cookie' + k, nm, `Eat ${n(k)} golden cookie${k > 1 ? 's' : ''}`, g => S(g, 'cookies'), k, c));
  [['penny', 'A Penny Saved', 'Get the penny cookie'], ['dragon', 'Dragon Rider', 'Get the Dragonflight cookie', 'pet_wyrm'], ['jackpot', 'Jackpot!', 'Get the Jackpot cookie', 'weapon_coin'], ['soul', 'Soul Food', 'Get the soul crumb cookie']]
    .forEach(([id, nm, d, c]) => add('misc', 'ck_' + id, nm, d, g => sub(g, 'cookieSeen', id) >= 1, c));
  [[10, 'Treasure Seeker'], [100, 'Chest Collector', 'cape_gold'], [500, 'Treasure Magnet'], [1000, 'Treasure Lord', 'helm_pirate']]
    .forEach(([k, nm, c]) => num('misc', 'chest' + k, nm, `Open ${n(k)} treasure chests`, g => S(g, 'chests'), k, c));
  [[10, 'Mystery Shopper'], [100, 'Box Opener', 'pet_mimic2']].forEach(([k, nm, c]) => num('misc', 'mystery' + k, nm, `Buy ${k} Mystery Chests`, g => S(g, 'mysteryBought'), k, c));
  // (a lifetime count now that reinforcement resets on rebirth; older saves count their current levels)
  const forged = g => Math.max(S(g, 'reinforces'), Object.values(g.forge || {}).reduce((a, b) => a + b, 0));
  [[20, 'Apprentice Smith'], [100, 'Master Smith', 'weapon_steel'], [250, 'Grandmaster Smith', 'helm_smith'], [1000, 'Forgelord', 'aura_forge']]
    .forEach(([k, nm, c]) => num('misc', 'forge' + k, nm, `Reinforce your gear ${n(k)} times in total`, forged, k, c));
  [[1e6, 'Millionaire'], [1e9, 'Billionaire', 'dye_rose'], [1e12, 'Trillionaire', 'pet_goldslime'], [1e15, 'Quadrillionaire', 'weapon_gilded'], [1e18, 'Money Is No Object', 'dye_money']]
    .forEach(([k, nm, c]) => num('misc', 'gold' + k, nm, `Earn ${fmtBig(k)} gold in total`, g => S(g, 'gold'), k, c));
  [[3600, 'Dedicated'], [36000, 'Devoted', 'cape_star'], [360000, 'Lifer', 'pet_owl']].forEach(([k, nm, c]) => num('misc', 'time' + k, nm, `Play for ${k / 3600} hour${k > 3600 ? 's' : ''}`, g => S(g, 'time'), k, c));
  add('misc', 'outfit', 'Dressed to Kill', 'Wear something from every Wardrobe category at once', g => g.cos && Object.keys(COSMETICS).every(c => g.cos[c] && g.cos[c] !== Object.keys(COSMETICS[c].items)[0]), 'aura_fashion');
  [[25, 'Overachiever'], [75, 'Completionist', 'helm_laurel'], [150, 'Living Trophy Case', 'cape_trophy']]
    .forEach(([k, nm, c]) => num('misc', 'meta' + k, nm, `Earn ${k} other achievements`, g => Object.keys(g.ach || {}).filter(id => !id.startsWith('meta')).length, k, c));
}
function fmtBig(n) { return n >= 1e18 ? n / 1e18 + ' quintillion' : n >= 1e15 ? n / 1e15 + ' quadrillion' : n >= 1e12 ? n / 1e12 + ' trillion' : n >= 1e9 ? n / 1e9 + ' billion' : n >= 1e6 ? n / 1e6 + ' million' : n.toLocaleString('en-US'); }

// ---------- cosmetics (Wardrobe): purely visual, unlocked by achievements ----------
// dye / weapon = palette swaps of the warrior sprite; helm / cape = pixel overlays on a 12×15 grid (y = row,
// 0 = the sprite's top row, negative = above the head); aura = sparkle colours; pet = a little follower
const COSMETICS = {
  dye: { name: 'Armor dye', items: {
    default: { name: 'Knight Blue' },
    dye_crimson: { name: 'Crimson', pal: { B: '#c62828', A: '#ef9a9a' } },
    dye_emerald: { name: 'Emerald', pal: { B: '#2e7d32', A: '#a5d6a7' } },
    dye_frost: { name: 'Frost', pal: { B: '#4fc3f7', A: '#e1f5fe', H: '#b3e5fc' } },
    dye_royal: { name: 'Royal', pal: { B: '#6a1b9a', A: '#ffd54f', H: '#ffca28' } },
    dye_void: { name: 'Voidforged', pal: { B: '#1a0a2e', A: '#7e57c2', H: '#311b92', L: '#12091f' } },
    dye_rose: { name: 'Rose Gold', pal: { B: '#f48fb1', A: '#ffe0b2', H: '#f8bbd0' } },
    dye_gold: { name: 'Ascended Gold', pal: { B: '#ffb300', A: '#fff59d', H: '#ffe082', L: '#8d6e63' } },
    dye_ember: { name: 'Ember', pal: { B: '#e65100', A: '#ffcc80', H: '#6d4c41' } },
    dye_bone: { name: 'Bone', pal: { B: '#d7ccc8', A: '#8d6e63', H: '#efebe9', L: '#5d4037' } },
    dye_ocean: { name: 'Ocean', pal: { B: '#00838f', A: '#80deea', H: '#4dd0e1' } },
    dye_jade: { name: 'Jade', pal: { B: '#00a86b', A: '#b9f6ca', H: '#69f0ae' } },
    dye_blood: { name: 'Bloodbound', pal: { B: '#7f0000', A: '#e53935', H: '#3e0000', L: '#1a0000' } },
    dye_world: { name: 'Worldsoul', pal: { B: '#1b5e20', A: '#7dffc0', H: '#26a69a' } },
    dye_money: { name: 'Money Bags', pal: { B: '#2e7d32', A: '#ffd54f', H: '#ffca28' } },
    dye_swamp: { name: 'Swamp', pal: { B: '#4e342e', A: '#8bc34a', H: '#33691e' } },
  } },
  helm: { name: 'Headwear', items: {
    none: { name: 'None' },
    helm_bandana: { name: 'Bandana', y: 0, rows: ['....RRRR.R..', '.........RR.'], pal: { R: '#e53935' } },
    helm_horns: { name: 'Viking Horns', y: -2, rows: ['..W......W..', '..W......W..', '...W....W...'], pal: { W: '#fff8e1' } },
    helm_plume: { name: 'Plume', y: -3, rows: ['......RR....', '.....RR.....', '.....R......'], pal: { R: '#e53935' } },
    helm_crown: { name: 'Crown', y: -2, rows: ['...Y.YY.Y...', '...YRYYRY...'], pal: { Y: '#ffd54f', R: '#e53935' } },
    helm_wizard: { name: 'Wizard Hat', y: -3, rows: ['......P.....', '.....PPY....', '....PPPP....', '..PPPPPPPP..'], pal: { P: '#5e35b1', Y: '#ffd54f' } },
    helm_halo: { name: 'Halo', y: -3, rows: ['....YYYY....', '...Y....Y...', '....YYYY....'], pal: { Y: '#fff59d' } },
    helm_godcrown: { name: 'Godheart Crown', y: -3, rows: ['.....P......', '...Y.YY.Y...', '...YPYYPY...'], pal: { Y: '#ff6ad5', P: '#7dffc0' } },
    helm_flame: { name: 'Flame Crown', y: -3, rows: ['....R..R....', '...RYRRYR...', '...YYYYYY...'], pal: { R: '#ff5722', Y: '#ffeb3b' } },
    helm_antlers: { name: 'Antlers', y: -3, rows: ['.B.B....B.B.', '..BB....BB..', '...B....B...'], pal: { B: '#8d6e63' } },
    helm_tophat: { name: 'Top Hat', y: -3, rows: ['....KKKK....', '....KKKK....', '....KRRK....', '...KKKKKK...'], pal: { K: '#212121', R: '#c62828' } },
    helm_cat: { name: 'Cat Ears', y: -2, rows: ['...K....K...', '...KP..PK...'], pal: { K: '#424242', P: '#f48fb1' } },
    helm_flower: { name: 'Flower Crown', y: -1, rows: ['...P.Y.W.P..'], pal: { P: '#f06292', Y: '#ffeb3b', W: '#ffffff' } },
    helm_skull: { name: 'Skull Helm', y: -2, rows: ['....WWWW....', '...WKWWKW...'], pal: { W: '#eeeeee', K: '#111111' } },
    helm_pirate: { name: 'Pirate Hat', y: -2, rows: ['....KKKK....', '..KKKWKKKK..'], pal: { K: '#212121', W: '#ffffff' } },
    helm_smith: { name: 'Smith\'s Goggles', y: 2, rows: ['...GOGOG....'], pal: { G: '#5d4037', O: '#ffb300' } },
    helm_laurel: { name: 'Laurel Wreath', y: -1, rows: ['..GG....GG..'], pal: { G: '#7cb342' } },
    helm_witch: { name: 'Witch Hat', y: -3, rows: ['......K.....', '.....KK.....', '....KPKK....', '..KKKKKKKK..'], pal: { K: '#212121', P: '#8e24aa' } },
    helm_twin: { name: 'Twin Horns', y: -2, rows: ['..R......R..', '..RR....RR..'], pal: { R: '#b71c1c' } },
    helm_absolute: { name: 'Absolute Crown', y: -3, rows: ['..R..R..R...', '..RYRRYRR...', '..RRRRRRR...'], pal: { R: '#ff3355', Y: '#ffffff' } },
  } },
  cape: { name: 'Cape', items: {
    none: { name: 'None' },
    cape_red: { name: 'Red Cape', pal: { C: '#c62828' } },
    cape_blue: { name: 'Blue Cape', pal: { C: '#1565c0' } },
    cape_shadow: { name: 'Shadow Cloak', pal: { C: '#212121' } },
    cape_flame: { name: 'Flame Cape', pal: { C: '#ff6d00' }, glow: '#ffcc80' },
    cape_royal: { name: 'Royal Mantle', pal: { C: '#6a1b9a' }, glow: '#ffd54f' },
    cape_gold: { name: 'Golden Cape', pal: { C: '#ffb300' } },
    cape_star: { name: 'Starry Cloak', pal: { C: '#1a237e' }, glow: '#ffffff' },
    cape_green: { name: 'Ranger Cloak', pal: { C: '#2e7d32' } },
    cape_white: { name: 'White Mantle', pal: { C: '#eceff1' } },
    cape_void: { name: 'Void Cloak', pal: { C: '#12091f' }, glow: '#e040fb' },
    cape_ice: { name: 'Frost Cape', pal: { C: '#4fc3f7' }, glow: '#e1f5fe' },
    cape_phoenix: { name: 'Phoenix Wings', pal: { C: '#ff6d00' }, glow: '#ffeb3b' },
    cape_eternal: { name: 'Eternal Shroud', pal: { C: '#f4f4ff' }, glow: '#ffffff' },
    cape_trophy: { name: 'Champion\'s Cape', pal: { C: '#b71c1c' }, glow: '#ffd54f' },
    cape_rainbow: { name: 'Rainbow Cape', rainbow: true, pal: { C: '#ff5a5a' } },
    cape_nightmare: { name: 'Nightmare Cloak', pal: { C: '#311b92' }, glow: '#e040fb' },
    cape_lap: { name: 'Cloak of Ages', pal: { C: '#0d1b3e' }, glow: '#7df9ff' },
  } },
  weapon: { name: 'Blade', items: {
    default: { name: 'Steel' },
    weapon_steel: { name: 'Polished Steel', pal: { W: '#ffffff' } },
    weapon_gold: { name: 'Golden', pal: { W: '#ffd54f' } },
    weapon_bone: { name: 'Bone', pal: { W: '#e0e0d0' } },
    weapon_flame: { name: 'Flame', pal: { W: '#ff7043' } },
    weapon_frost: { name: 'Frost', pal: { W: '#80deea' } },
    weapon_void: { name: 'Void', pal: { W: '#b388ff' } },
    weapon_rainbow: { name: 'Prismatic', rainbow: true },
    weapon_emerald: { name: 'Emerald', pal: { W: '#69f0ae' } },
    weapon_ruby: { name: 'Ruby', pal: { W: '#ff1744' } },
    weapon_shadow: { name: 'Shadow', pal: { W: '#455a64' } },
    weapon_sun: { name: 'Sunblade', pal: { W: '#fff59d' } },
    weapon_razor: { name: 'Razor', pal: { W: '#b0bec5' } },
    weapon_coin: { name: 'Gold Coin', pal: { W: '#ffca28' } },
    weapon_gilded: { name: 'Gilded', pal: { W: '#ffe082' } },
    weapon_infinite: { name: 'Infinite', rainbow: true },
  } },
  aura: { name: 'Aura', items: {
    none: { name: 'None' },
    aura_embers: { name: 'Embers', colors: ['#ff7043', '#ffab40'] },
    aura_frost: { name: 'Frost', colors: ['#e1f5fe', '#81d4fa'] },
    aura_void: { name: 'Void', colors: ['#7e57c2', '#e040fb'] },
    aura_sparkle: { name: 'Sparkles', colors: ['#ffffff', '#fff59d'] },
    aura_glow: { name: 'Glow', colors: ['#9dffd9', '#b8ffea'] },
    aura_gold: { name: 'Gilded', colors: ['#ffd54f', '#ffecb3'] },
    aura_rainbow: { name: 'Rainbow', rainbow: true },
    aura_storm: { name: 'Storm', colors: ['#fff176', '#90caf9'] },
    aura_leaves: { name: 'Leaves', colors: ['#7cb342', '#c5e1a5'] },
    aura_shadow: { name: 'Shadow', colors: ['#263238', '#546e7a'] },
    aura_hearts: { name: 'Hearts', colors: ['#f06292', '#f8bbd0'] },
    aura_blood: { name: 'Blood', colors: ['#b71c1c', '#e53935'] },
    aura_lightning: { name: 'Lightning', colors: ['#ffffff', '#fff176'] },
    aura_divine: { name: 'Divine', colors: ['#ffe066', '#ffffff'] },
    aura_sun: { name: 'Sunlight', colors: ['#fff3a0', '#ffd54f'] },
    aura_coins: { name: 'Coins', colors: ['#ffca28', '#ffb300'] },
    aura_stars: { name: 'Stardust', colors: ['#6ff0ff', '#ffffff'] },
    aura_forge: { name: 'Sparks', colors: ['#ff9800', '#ffeb3b'] },
    aura_fashion: { name: 'Glamour', colors: ['#ff80ab', '#b388ff'] },
    aura_celestial: { name: 'Celestial', colors: ['#fff59d', '#9fa8da'] },
    aura_lap: { name: 'Lap Runner', colors: ['#7df9ff', '#b388ff'] },
    aura_veil: { name: 'Veil', colors: ['#a8c8ff', '#e8eaf6'] },
  } },
  pet: { name: 'Pet', items: {
    none: { name: 'None' },
    pet_rat: { name: 'Crypt Rat', sprite: 'rat' },
    pet_slime: { name: 'Slime', sprite: 'slime' },
    pet_bat: { name: 'Bat', sprite: 'bat', fly: true },
    pet_ghost: { name: 'Ghost', sprite: 'ghost', fly: true },
    pet_wisp: { name: 'Wisp', sprite: 'wisp', fly: true },
    pet_chest: { name: 'Mimic', sprite: 'chest' },
    pet_skull: { name: 'Fire Skull', sprite: 'skull', pal: { K: '#ff6d00', W: '#ffcc80' }, fly: true },
    pet_crystal: { name: 'Crystal', sprite: 'crystal', fly: true },
    pet_goldslime: { name: 'Golden Slime', sprite: 'slime', pal: { G: '#ffc107', L: '#fff59d', K: '#8d6e00' } },
    pet_dragon: { name: 'Baby Dragon', sprite: 'lizard', pal: { O: '#43a047', Y: '#ffeb3b', T: '#1b5e20' } },
    pet_mushroom: { name: 'Mushroom', sprite: 'mushroom' },
    pet_frog: { name: 'Dart Frog', sprite: 'toad', pal: { G: '#1e88e5', L: '#90caf9', R: '#ffeb3b' } },
    pet_crab: { name: 'Crab', sprite: 'crab' },
    pet_bird: { name: 'Sparrow', sprite: 'bird', fly: true },
    pet_eye: { name: 'Watcher', sprite: 'eye', fly: true },
    pet_spider: { name: 'Spiderling', sprite: 'spider' },
    pet_jelly: { name: 'Jellyfish', sprite: 'jelly', fly: true },
    pet_goblin: { name: 'Loot Goblin', sprite: 'imp', pal: { R: '#7cb342', Y: '#ffeb3b', T: '#33691e' } },
    pet_amulet: { name: 'Charm Spirit', sprite: 'wisp', pal: { C: '#ffd54f', W: '#fff8e1', K: '#ff6f00' }, fly: true },
    pet_cookie: { name: 'Cookie', sprite: 'cookie', fly: true },
    pet_wyrm: { name: 'Wyrmling', sprite: 'lizard', pal: { O: '#e53935', Y: '#ffeb3b', T: '#7f0000' } },
    pet_mimic2: { name: 'Void Mimic', sprite: 'chest', pal: { G: '#7e57c2', B: '#311b92', Y: '#e040fb' } },
    pet_bearcub: { name: 'Bear Cub', sprite: 'bear' },
    pet_drake: { name: 'Drakeling', sprite: 'dragon', fly: true },
    pet_owl: { name: 'Owl', sprite: 'bird', pal: { B: '#6d4c41', W: '#efebe9', K: '#ffeb3b', O: '#ffb300', Y: '#ffb300' }, fly: true },
  } },
};
// the cape's shape, drawn behind the hero (he faces right, so it trails to the left)
const CAPE_ROWS = ['.CC.........', 'CCC.........', 'CC..........', 'CC..........', 'CCC.........', 'CCC.........', '.C..........'], CAPE_Y = 5;

// ---------- 🐾 pets: each gives a small bonus while worn (same stat names as gear bonuses) ----------
// bosses sometimes drop a pet you don't have yet (PET_DROP per boss kill)
const PET_DROP = 0.004;
const PET_FX = {
  pet_rat: { gold: 5 }, pet_slime: { hpP: 4 }, pet_bat: { critD: 10 }, pet_ghost: { xp: 5 }, pet_wisp: { loot: 5 }, pet_chest: { gold: 8 },
  pet_skull: { atkP: 4 }, pet_crystal: { soulFind: 5 }, pet_goldslime: { gold: 12 }, pet_dragon: { atkP: 6, hpP: 6 },
  pet_mushroom: { regen: 0.3 }, pet_frog: { dodge: 2 }, pet_crab: { armor: 3 }, pet_bird: { spd: 4 }, pet_eye: { crit: 3 },
  pet_spider: { multi: 4 }, pet_jelly: { splash: 6 }, pet_goblin: { loot: 10 }, pet_amulet: { soulFind: 8 }, pet_cookie: { xp: 8 },
  pet_wyrm: { atkP: 8 }, pet_mimic2: { loot: 8, gold: 8 }, pet_owl: { xp: 12 }, pet_bearcub: { hpP: 8 }, pet_drake: { atkP: 5, critD: 15 },
};
for (const [id, fx] of Object.entries(PET_FX)) if (COSMETICS.pet.items[id]) COSMETICS.pet.items[id].fx = fx;

// ---------- 🛡 gear sets: some Epic+ items belong to a set; wearing 2 / 3 / 4 pieces adds bonus stats ----------
const SET_CHANCE = 0.12;  // for items Epic or better
// each set has home zones (`zones`, by zone name): half of the set items found there belong to one of that zone's sets,
// so hunting a set means farming where it lives
const SET_HOME = 0.5;
const GEAR_SETS = {
  dragonbone: { name: 'Dragonbone', color: '#ff8a65', 2: { atkP: 15 }, 3: { critD: 15 }, 4: { atkP: 40, critD: 30 }, zones: ['Molten Depths', 'Dragon\'s Roost'] },
  warden: { name: 'Warden', color: '#90caf9', 2: { hpP: 15 }, 3: { regen: 0.4 }, 4: { hpP: 40, armor: 10 }, zones: ['Forgotten Crypt', 'Frozen Abyss'] },
  fortune: { name: 'Fortune', color: '#ffd54f', 2: { gold: 25 }, 3: { loot: 12 }, 4: { gold: 50, loot: 25 }, zones: ['Desert Tomb', 'Crystal Caverns'] },
  tempest: { name: 'Tempest', color: '#b2ebf2', 2: { spd: 8 }, 3: { multi: 8 }, 4: { multi: 20, atkP: 20 }, zones: ['Storm Peaks', 'Celestial Spire'] },
  soulbound: { name: 'Soulbound', color: '#b388ff', 2: { soulFind: 15 }, 3: { xp: 15 }, 4: { soulFind: 40, xp: 30 }, zones: ['Shadow Realm', 'Void Rift'] },
  // (depth pass) more sets
  bloodmoon: { name: 'Bloodmoon', color: '#e53935', 2: { leech: 1 }, 3: { atkP: 15 }, 4: { leech: 3, atkP: 30 }, zones: ['Blood Swamp', 'Haunted Manor'] },
  shadow: { name: 'Nightstalker', color: '#9575cd', 2: { dodge: 3 }, 3: { crit: 5 }, 4: { dodge: 8, critD: 40 }, zones: ['Shadow Realm', 'Overgrown Ruins'] },
  titan: { name: 'Titanguard', color: '#bcaaa4', 2: { bossDmg: 20 }, 3: { hpP: 15 }, 4: { bossDmg: 60, hpP: 25 }, zones: ['Bone Wastes', 'Dwarven Forge'] },
  sage: { name: 'Sage', color: '#80deea', 2: { xp: 25 }, 3: { critD: 20 }, 4: { xp: 60, atkP: 20 }, zones: ['Ethereal Library', 'Fungal Hollows'] },
  gilded: { name: 'Gilded', color: '#ffca28', 2: { loot: 15 }, 3: { gold: 25 }, 4: { loot: 40, gold: 40 }, zones: ['Clockwork Vault', 'Desert Tomb'] },
  storm: { name: 'Stormcaller', color: '#fff176', 2: { splash: 5 }, 3: { multi: 8 }, 4: { splash: 12, multi: 15 }, zones: ['Storm Peaks', 'Sunken Grotto'] },
  ironclad: { name: 'Ironclad', color: '#90a4ae', 2: { armor: 4 }, 3: { regen: 0.5 }, 4: { armor: 10, hpP: 30 }, zones: ['Sunken Temple', 'Frozen Abyss'] },
};
const SET_TIERS = [2, 3, 4];

// ---------- ☠ boss abilities (by zone index): Lords and Guardians each have one ----------
// summon: calls minions · enrage: faster & harder under 50% · shield: shields itself · breath: telegraphed big hit ·
// curse: your damage -30% for a while · heal: heals itself · slam: hits and stuns you
const BOSS_ABILITIES = {
  summon: { name: 'Summon', every: 8, n: 2 },
  enrage: { name: 'Enrage', below: 0.5, spd: 1.8, atk: 1.5 },
  shield: { name: 'Stone Skin', every: 10, pct: 0.25 },
  breath: { name: 'Breath', every: 8, windup: 1.5, mult: 3.5 },
  curse: { name: 'Curse', every: 9, secs: 4, dmg: 0.7 },
  heal: { name: 'Regenerate', every: 8, pct: 0.1 },
  slam: { name: 'Slam', every: 10, mult: 2, stun: 1 },
  // (depth pass) only as extra abilities, from the second lap: drain hits and heals it, frenzy doubles its attack speed
  // for a while, barrier makes it immune for a moment, meteor is a telegraphed hit that also stuns
  drain: { name: 'Drain', every: 9, mult: 1, pct: 0.05 },
  frenzy: { name: 'Frenzy', every: 12, secs: 4, spd: 2 },
  barrier: { name: 'Barrier', every: 12, secs: 1.5 },
  meteor: { name: 'Meteor', every: 11, windup: 2, mult: 3, stun: 0.5 },
};
// from lap 2 a boss has a second ability, from lap 3 a third (see bossAbilities in game.js)
const EXTRA_AB = ['drain', 'frenzy', 'barrier', 'meteor', 'curse', 'heal', 'summon', 'slam', 'shield'];
const LORD_AB = ['summon', 'summon', 'heal', 'summon', 'slam', 'curse', 'breath', 'breath', 'shield', 'shield', 'curse', 'curse', 'heal', 'slam', 'breath', 'summon', 'curse', 'summon', 'slam', 'breath'];
const GUARD_AB = ['enrage', 'heal', 'enrage', 'curse', 'breath', 'slam', 'slam', 'enrage', 'shield', 'breath', 'curse', 'enrage', 'summon', 'enrage', 'breath', 'shield', 'shield', 'curse', 'enrage', 'heal'];

// ---------- 🌍 zone effects: every zone has its own rule (by zone index) ----------
// hero: atk/spd multipliers, crit (flat %), heal (regen & lifesteal multiplier), dot (% max hp lost per second in fights), miss (% of hits missing)
// enemy: hp/atk/spd multipliers · reward: gold/xp multipliers · bolt: lightning helps you every N seconds
const ZONE_FX = [
  { name: 'Quiet Crypt', desc: 'No special rules. A good place to start.' },
  { name: 'Spores', desc: 'Healing is 25% weaker', hero: { heal: 0.75 } },
  { name: 'Overgrowth', desc: 'Monsters have 10% more health', enemy: { hp: 1.1 } },
  { name: 'Underwater', desc: 'You attack 10% slower', hero: { spd: 0.9 } },
  { name: 'Searing Heat', desc: 'Lose 1% of your max health every second while fighting', hero: { dot: 1 } },
  { name: 'Mirage', desc: '8% of your attacks miss', hero: { miss: 8 } },
  { name: 'Thunderstorm', desc: 'Lightning strikes a monster for 200% of your attack every 6s (helps you!)', bolt: 6 },
  { name: 'Frostbite', desc: 'You attack 15% slower', hero: { spd: 0.85 } },
  { name: 'Prismatic Glare', desc: 'Monsters deal 10% more damage', enemy: { atk: 1.1 } },
  { name: 'Overclocked', desc: 'Monsters attack 15% faster', enemy: { spd: 1.15 } },
  { name: 'Darkness', desc: '-10% crit chance', hero: { crit: -10 } },
  { name: 'Dread', desc: 'You deal 10% less damage', hero: { atk: 0.9 } },
  { name: 'Poison Fog', desc: 'Lose 1.5% of your max health every second while fighting', hero: { dot: 1.5 } },
  { name: 'Bone Dust', desc: 'Monsters have 15% more health', enemy: { hp: 1.15 } },
  { name: 'Scorched', desc: 'Monsters deal 15% more damage', enemy: { atk: 1.15 } },
  { name: 'Blessed Light', desc: '+25% gold and XP (helps you!)', reward: { gold: 1.25, xp: 1.25 } },
  { name: 'Crushing Depths', desc: 'You attack 10% slower and monsters have 10% more health', hero: { spd: 0.9 }, enemy: { hp: 1.1 } },
  { name: 'Silence', desc: '-15% crit chance', hero: { crit: -15 } },
  { name: 'Forge Heat', desc: 'Lose 1% of your max health every second while fighting, but +25% gold', hero: { dot: 1 }, reward: { gold: 1.25 } },
  { name: 'Unraveling', desc: 'Monsters deal 20% more damage and attack 10% faster', enemy: { atk: 1.2, spd: 1.1 } },
];
// these three tables are written in the order the zones were defined; attach them to the zones themselves
// (the game reads zone.fx / zone.lordAb / zone.guardAb, so reordering zones never mixes them up)
ZONES_DEFINED.forEach((z, i) => { z.fx = ZONE_FX[i]; z.lordAb = LORD_AB[i]; z.guardAb = GUARD_AB[i]; });
// ---------- 🔁 laps: every full lap of the dungeon, monsters get much tougher on top of the per-floor growth ----------
const LAP = { hp: 5, atk: 3 };

// ---------- 📖 bestiary: kill milestones per monster type ----------
// each tier: +dmg% against that monster; the later tiers also pay gems (bosses have their own, lower milestones)
// (depth pass: a 4th tier, 100K kills / 1,000 for bosses)
const BESTIARY = { tiers: [100, 1000, 10000, 100000], dmg: [5, 10, 20, 30], gems: [0, 1, 2, 3], bossTiers: [1, 10, 100, 1000], bossGems: [0, 1, 1, 3] };

// ---------- 📅 daily bounties: 3 goals a day for gems ----------
// stat(g) = the counter a bounty watches; n = possible targets
const BOUNTY_TYPES = [
  { id: 'kills', text: n => `Defeat ${n} monsters`, stat: g => g.stats.kills || 0, n: [300, 500, 800] },
  { id: 'traits', text: n => `Defeat ${n} monsters with a trait`, stat: g => Object.values(g.stats.traitKills || {}).reduce((a, b) => a + b, 0), n: [25, 40, 60] },
  { id: 'bosses', text: n => `Defeat ${n} bosses`, stat: g => g.stats.bossKills || 0, n: [5, 8, 12] },
  { id: 'chests', text: n => `Open ${n} treasure chests`, stat: g => g.stats.chests || 0, n: [2, 3, 5] },
  { id: 'cookies', text: n => `Eat ${n} golden cookies`, stat: g => g.stats.cookies || 0, n: [2, 3, 4] },
  { id: 'epics', text: n => `Find ${n} Epic or better items`, stat: g => g.stats.epics || 0, n: [5, 10, 15] },
  { id: 'floors', text: n => `Clear ${n} floors (not replays)`, stat: g => g.stats.newFloors || 0, n: [10, 20, 30] },
  { id: 'crits', text: n => `Land ${n} critical hits`, stat: g => g.stats.crits || 0, n: [500, 1000, 2000] },
];
BOUNTY_TYPES.push(
  { id: 'elites', text: n => `Defeat ${n} Elite monsters`, stat: g => (g.stats.traitKills || {}).elite || 0, n: [8, 15, 25] },
  { id: 'mods', text: n => `Find ${n} items with a modifier`, stat: g => g.stats.mods || 0, n: [3, 5, 8] },
  { id: 'executes', text: n => `Execute ${n} monsters`, stat: g => g.stats.executes || 0, n: [20, 40, 60] },
  { id: 'dodges', text: n => `Dodge ${n} attacks`, stat: g => g.stats.dodges || 0, n: [40, 80, 150] },
  { id: 'blitz', text: n => `Blitz through ${n} floors`, stat: g => g.stats.blitzed || 0, n: [100, 200, 400] },
  { id: 'scrap', text: n => `Collect ${n} scrap`, stat: g => g.stats.scrap || 0, n: [30, 80, 200] },
  { id: 'guards', text: n => `Defeat ${n} Guardians`, stat: g => Object.values(g.stats.bossG || {}).reduce((a, b) => a + b, 0), n: [3, 5, 8] },
  { id: 'rebirth', text: () => 'Rebirth once', stat: g => g.rebirths || 0, n: [1] },
);
const BOUNTY_REWARD = { each: 1, all: 2 };

// ---------- ✨ special stages: now and then a new floor turns into something unusual ----------
// chance per new (not replayed, not boss) floor. waves: what spawns instead of the usual monsters (null = the usual)
const SPECIAL_CHANCE = 0.004;
const SPECIAL_STAGES = {
  vault: { name: 'Treasure Vault', icon: '💰', color: '#ffd54f', desc: 'Goblins stuffed with gold. Catch them before they escape!', wave: ['treasure_goblin', 8], secs: 20 },
  hall: { name: 'Loot Hall', icon: '🎁', color: '#ffb74d', desc: 'Every monster here drops a boss-quality item' },
  gauntlet: { name: 'Elite Gauntlet', icon: '☠', color: '#ff5252', desc: 'Every monster is Elite: tougher, and 4× rewards' },
  well: { name: 'Soul Well', icon: '✦', color: '#b388ff', desc: 'Every kill here gives souls' },
  grotto: { name: 'Crystal Grotto', icon: '💎', color: '#6fe3ff', desc: 'Crystal bats: each has a chance to drop a gem', wave: ['crystal_bat', 6] },
  den: { name: 'Beast Den', icon: '🐾', color: '#ffb3e6', desc: 'Clear it for a good chance at a new pet' },
  // (depth pass) req = a feature that must be unlocked first
  mimic: { name: 'Mimic Hoard', icon: '📦', color: '#d7a86e', desc: 'Treasure chests that bite back. Each one pays out like a chest', wave: ['mimic', 5] },
  shrine: { name: 'Forgotten Shrine', icon: '⛩', color: '#ffe082', desc: 'Clear it for a blessing (×1.5 damage for 2 minutes) and a golden cookie' },
  library: { name: 'Lost Library', icon: '📚', color: '#80deea', desc: 'Every kill here gives ×5 XP' },
  arena: { name: 'Champion Arena', icon: '🏟', color: '#ff8a65', desc: 'One mighty Champion with two traits. It drops 3 boss-quality items', wave: ['CHAMP', 1] },
  scrapheap: { name: 'Scrap Heap', icon: '🔩', color: '#b0bec5', desc: 'Every kill here drops scrap', req: 'forge' },
};

// special stage achievements
{
  const found = g => Object.values(g.stats.specials || {}).reduce((a, b) => a + b, 0);
  ACHIEVEMENTS.push({ cat: 'misc', id: 'special1', name: 'Something Special', desc: 'Find a special stage', test: g => found(g) >= 1 });
  ACHIEVEMENTS.push({ cat: 'misc', id: 'special25', name: 'Stage Hunter', desc: 'Find 25 special stages', test: g => found(g) >= 25, prog: g => [found(g), 25], cos: 'aura_special' });
  for (const [id, S] of Object.entries(SPECIAL_STAGES)) ACHIEVEMENTS.push({ cat: 'misc', id: 'special_' + id, name: `${S.name} Found`, desc: `Find a ${S.name} ${S.icon}`, test: g => ((g.stats.specials || {})[id] || 0) >= 1 });
  COSMETICS.aura.items.aura_special = { name: 'Wonder', colors: ['#ffd54f', '#6fe3ff', '#ff80ab'] };
}
// more achievements (gems, bounties, forge work, pets, relics, ranged monsters, amulets, twin bosses)
{
  const A = (cat, id, name, desc, get, k, cos) => ACHIEVEMENTS.push({ cat, id, name, desc, test: g => get(g) >= k, prog: k > 1 ? g => [get(g), k] : undefined, cos });
  const S = (g, k) => g.stats[k] || 0;
  [[100, 'Gem Collector'], [500, 'Gem Hoarder', 'aura_gem'], [2000, 'Dragon of Gems']].forEach(([k, n, c]) => A('loot', 'gems' + k, n, `Earn ${k} gems in total`, g => S(g, 'gemsEarned'), k, c));
  [[10, 'Errand Runner'], [50, 'Bounty Hunter', 'helm_bounty'], [200, 'Legend of the Board']].forEach(([k, n, c]) => A('misc', 'bounties' + k, n, `Finish ${k} daily bounties`, g => S(g, 'bountiesDone'), k, c));
  [[25, 'Tinkerer'], [250, 'Perfectionist']].forEach(([k, n]) => A('misc', 'reforge' + k, n, `Reforge items ${k} times`, g => S(g, 'reforges'), k));
  [[10, 'Blacksmith'], [100, 'Tempered Steel', 'weapon_tempered']].forEach(([k, n, c]) => A('misc', 'temper' + k, n, `Temper items ${k} times`, g => S(g, 'tempers'), k, c));
  A('misc', 'stashfull', 'Hoarder\'s Hoard', 'Have 250 items in the stash', g => (g.stash || []).length, 250);
  const pets = g => typeof cosUnlocked === 'function' ? Object.keys(COSMETICS.pet.items).slice(1).filter(cosUnlocked).length : 0;
  [[10, 'Menagerie'], [Object.keys(COSMETICS.pet.items).length - 1, 'Beastmaster', 'aura_paw']].forEach(([k, n, c]) => A('misc', 'pets' + k, n, k > 10 ? 'Own every pet' : `Own ${k} pets`, pets, k, c));
  A('loot', 'relicsall', 'Relic Keeper', 'Own every relic', g => Object.keys(RELICS).filter(k => (g.relics || {})[k]).length, Object.keys(RELICS).length, 'cape_relic');
  A('progress', 'rankmax', 'Grandmaster', 'Train any skill to its highest rank', g => Math.max(0, ...Object.values(g.skillRank || {})), SKILL_RANKS.max);
  [[250, 'Arrow Catcher'], [2500, 'Siege Breaker', 'helm_archer']].forEach(([k, n, c]) => A('combat', 'ranged' + k, n, `Defeat ${k.toLocaleString('en-US')} throwers and archers`, g => S(g, 'rangedKills'), k, c));
  [[10, 'Tag Team'], [100, 'Twin Terror']].forEach(([k, n]) => A('combat', 'twins' + k, n, `Win ${k} twin boss fights`, g => S(g, 'twinKills'), k));
  [8, 9, 10].forEach(r => A('loot', 'amt' + r, `${AMULET_TIERS[r].name} Charm`, `Find a${/^[AEIOU]/.test(AMULET_TIERS[r].name) ? 'n' : ''} ${AMULET_TIERS[r].name} amulet`, g => g.stats.bestAm == null ? -1 : g.stats.bestAm, r, r === 10 ? 'aura_eternity' : undefined));
  Object.assign(COSMETICS.aura.items, { aura_gem: { name: 'Gemstorm', colors: ['#6fe3ff', '#b3e5fc'] }, aura_paw: { name: 'Pawprints', colors: ['#ffb3e6', '#fff0f8'] }, aura_eternity: { name: 'Eternity', rainbow: true } });
  Object.assign(COSMETICS.helm.items, { helm_bounty: { name: 'Bounty Hat', y: -2, rows: ['....BBBB....', '..BBBBBBBB..'], pal: { B: '#6d4c41' } }, helm_archer: { name: 'Archer\'s Hood', y: -1, rows: ['...GGGGGG...'], pal: { G: '#2e7d32' } } });
  COSMETICS.weapon.items.weapon_tempered = { name: 'Tempered', pal: { W: '#ff8a65' } };
  COSMETICS.cape.items.cape_relic = { name: 'Relic Mantle', pal: { C: '#004d40' }, glow: '#6fe3ff' };
}

// ---------- 💎 more gem uses ----------
Object.assign(RELICS, {
  tome: { name: 'Monster Tome', icon: '📖', cost: 100, desc: 'Bestiary damage bonuses are doubled' },
  lens: { name: 'Jeweler\'s Lens', icon: '🔍', cost: 100, desc: 'New amulets roll one extra bonus' },
  hourglass: { name: 'Hourglass', icon: '⏳', cost: 120, desc: '+25% offline efficiency (total max 90%), and offline time counts up to 24h (was 12h)' },
  anvil: { name: 'Masterwork Anvil', icon: '⚒', cost: 150, desc: 'Reinforcing, reforging, tempering and scrap chests cost 25% less' },
  lantern: { name: 'Soul Lantern', icon: '🏮', cost: 200, desc: '+25% souls from rebirths' },
  midas: { name: 'Midas Touch', icon: '🪙', cost: 250, desc: '+50% gold from everything' },
});
// one-off gem spends (repeatable)
const GEM_SHOP = {
  reroll: { name: 'Reroll amulet', icon: '🎲', cost: 15, desc: 'Reroll your worn amulet\'s bonuses (same tier and main bonus)' },
  pet: { name: 'Summon a pet', icon: '🐾', cost: 30, desc: 'Unlock a random pet you don\'t have yet' },
  cookie: { name: 'Call a cookie', icon: '🍪', cost: 5, desc: 'A golden cookie appears right now' },
  goldrush: { name: 'Gold rush', icon: '💰', cost: 8, desc: '10 minutes of your income in gold, right now' },
  frenzy: { name: 'Battle frenzy', icon: '⚔', cost: 12, desc: 'Damage ×1.5 and attack speed ×1.5 for 3 minutes' },
  warp: { name: 'Warp ahead', icon: '🌀', cost: 10, desc: 'Skip 5 floors (stops before a boss)' },
  scrapbox: { name: 'Scrap crate', icon: '🔩', cost: 15, desc: '+40 scrap' },
  soulsnack: { name: 'Soul snack', icon: '✦', cost: 25, desc: 'Souls worth 5% of rebirthing at your best floor' },
  rebounty: { name: 'New bounty', icon: '📅', cost: 4, desc: 'Swap your first unfinished daily bounty for a different one' },
};

// ---------- 🌠 Fate: a guaranteed jackpot every so many items ----------
// rarity index → items. Every item that drops counts toward each tier; after that many items without one of that
// tier (or better), the next drop is guaranteed to be it. Counts are kept through rebirths and run on their own.
// (Replaced Forge ascension, which the user found turned into a chore: melting items over and over.)
// At ~20k items an hour: Ethereal ~15h of play, Ascended ~2 days, … Absolute ~7 months.
const FATE = { 10: 3e5, 11: 1e6, 12: 3e6, 13: 1e7, 14: 3e7, 15: 1e8 };

// ---------- 🏁 challenge runs: a fresh game apart from your save, with one rule, until you reach the goal ----------
// fx (the rule): hp/heal/gold = × your health / healing / gold, ehp/eatk = × monster health / damage,
// noUpg = gold upgrades locked, maxR = best rarity you can wear, time = seconds of play to reach the goal in.
// reward: permanent × on your normal save once beaten (atk, hp, gold, xp, loot, souls, boss = boss damage)
// (goals from fresh-game sims with auto-buy on: each takes very roughly 20–45 minutes; "can't wear gear at all"
// was tried and never got past floor 10)
// 27 Sep retune (4 sims each, 60 min, with 💪 Grit): the old goals had drifted out of reach after the balance passes
// (glass/drought/pauper at 100 never made it; Colossi ×3/×1.5 never passed the floor-20 Lord; Speedrun reached 20–52 in
// 15 min). Goals now sit where most runs arrive in ~35–50 min. No rule: F76–105 at 40 min.
const CHALLENGES = {
  bare: { name: 'Bare Bones', icon: '🚫', rule: 'Gold upgrades are locked', goal: 35, fx: { noUpg: true }, reward: { atk: 1.2 } },
  glass: { name: 'Glass Cannon', icon: '🥛', rule: 'You have ×0.2 health', goal: 70, fx: { hp: 0.2 }, reward: { hp: 1.2 } },
  drought: { name: 'Drought', icon: '🏜', rule: 'All healing ×0.1 (lifesteal, regeneration and between floors)', goal: 70, fx: { heal: 0.1 }, reward: { boss: 1.25 } },
  pauper: { name: 'Pauper', icon: '🪙', rule: 'You earn ×0.02 gold', goal: 55, fx: { gold: 0.02 }, reward: { gold: 1.3 } },
  rags: { name: 'Rags', icon: '🧦', rule: 'You can only wear Common gear', goal: 50, fx: { maxR: 0 }, reward: { loot: 1.3 } },
  colossi: { name: 'Colossi', icon: '🗿', rule: 'Monsters have ×2 health and ×1.25 damage', goal: 55, fx: { ehp: 2, eatk: 1.25 }, reward: { souls: 1.25 } },
  sprint: { name: 'Speedrun', icon: '⏱', rule: 'Reach the goal within 25 minutes of play', goal: 60, fx: { time: 1500 }, reward: { xp: 1.3 } },
  // (depth pass) noSkills, noCrit, wave = × monsters per floor, fallBack = floors lost when you fall, loot = × loot drops
  // (floors at 40 min in the retune sims: silence 33–78, blunt 73–88, horde 79–99, backslide 88–114 (replays are quick,
  // so it mostly costs time), famine 31–72. A halved boss timer was tried and did nothing: bosses are beaten or you fall
  // long before the timer matters)
  silence: { name: 'Silence', icon: '🤐', rule: 'You can\'t use skills', goal: 60, fx: { noSkills: true }, reward: { atk: 1.15 } },
  blunt: { name: 'Blunt', icon: '🔨', rule: 'You never land critical hits', goal: 75, fx: { noCrit: true }, reward: { boss: 1.2 } },
  horde: { name: 'Horde', icon: '🐜', rule: 'Twice as many monsters on every floor', goal: 90, fx: { wave: 2 }, reward: { xp: 1.25 } },
  backslide: { name: 'Backslide', icon: '⏬', rule: 'Falling sends you back 10 floors instead of 1', goal: 95, fx: { fallBack: 10 }, reward: { souls: 1.2 } },
  famine: { name: 'Famine', icon: '🥀', rule: 'Items drop ×0.1 as often', goal: 60, fx: { loot: 0.1 }, reward: { gold: 1.2, loot: 1.1 } },
};
const CHALLENGE_REWARD_NAMES = { atk: 'damage', hp: 'health', gold: 'gold', xp: 'XP', loot: 'loot drops', souls: 'souls from rebirths', boss: 'boss damage' };

// ---------- ✧ Constellations: permanent talents bought with Stardust (late game, from lap 2) ----------
// Stardust: every floor beaten for the first time ever pays (laps done) ✧, boss floors ×STAR.boss; every new Boss
// Rush record boss pays STAR.rush × laps (at least 1). Each constellation's stars are bought in order, the i-th
// costing base × 2^i. fx: × multipliers (atk, hp, critD, heal, boss, gold, xp, loot, souls, mod = modifier luck,
// fate = how fast 🌠 Fate counts, dust = Stardust, essence = Awakening Essence); offline = + offline efficiency and cap
const STAR = { at: 401, boss: 5, rush: 5 };
const CONSTELLATIONS = {
  warrior: { name: 'The Warrior', icon: '⚔', color: '#ff8a65', base: 5, nodes: [{ atk: 1.1 }, { critD: 1.2 }, { atk: 1.15 }, { boss: 1.25 }, { atk: 1.2 }, { atk: 1.3 }] },
  guardian: { name: 'The Guardian', icon: '🛡', color: '#90caf9', base: 5, nodes: [{ hp: 1.1 }, { heal: 1.2 }, { hp: 1.15 }, { hp: 1.2 }, { heal: 1.3 }, { hp: 1.3 }] },
  miser: { name: 'The Miser', icon: '💰', color: '#ffd54f', base: 8, nodes: [{ gold: 1.25 }, { gold: 1.25 }, { xp: 1.25 }, { gold: 1.5 }, { xp: 1.5 }, { gold: 2 }] },
  seer: { name: 'The Seer', icon: '🔮', color: '#ce93d8', base: 8, nodes: [{ loot: 1.2 }, { mod: 1.1 }, { fate: 1.25 }, { loot: 1.3 }, { mod: 1.15 }, { fate: 1.5 }] },
  wanderer: { name: 'The Wanderer', icon: '🌙', color: '#b3c7ff', base: 12, nodes: [{ souls: 1.2 }, { offline: 0.02 }, { souls: 1.3 }, { xp: 1.3 }, { offline: 0.03 }, { souls: 1.5 }] },
  void: { name: 'The Void', icon: '🕳', color: '#e040fb', base: 30, nodes: [{ dust: 1.2 }, { essence: 1.2 }, { atk: 1.25, hp: 1.25 }, { dust: 1.3 }, { essence: 1.3 }, { atk: 1.3, hp: 1.3, gold: 1.3, loot: 1.3 }] },
};
// (depth pass) three more stars in every constellation (still ×2 the price each)
{
  const more = { warrior: [{ critD: 1.3 }, { boss: 1.4 }, { atk: 1.4 }], guardian: [{ heal: 1.3 }, { hp: 1.3 }, { hp: 1.4 }],
    miser: [{ xp: 1.5 }, { gold: 2 }, { gold: 2, xp: 1.5 }], seer: [{ loot: 1.4 }, { mod: 1.2 }, { fate: 1.5 }],
    wanderer: [{ souls: 1.4 }, { offline: 0.03 }, { souls: 1.6 }], void: [{ dust: 1.4 }, { essence: 1.4 }, { atk: 1.4, hp: 1.4, gold: 1.4, loot: 1.4 }] };
  for (const [id, nodes] of Object.entries(more)) CONSTELLATIONS[id].nodes.push(...nodes);
}
const STAR_FX_NAMES = { atk: 'damage', hp: 'health', critD: 'crit damage', heal: 'healing', boss: 'boss damage', gold: 'gold', xp: 'XP', loot: 'loot drops',
  souls: 'souls from rebirths', mod: 'modifier chance', fate: '🌠 Fate speed', dust: 'Stardust', essence: 'Essence', offline: 'offline efficiency (and its cap)', insight: 'Insight' };
FEATURES.speed = { at: 801, name: '⏩ 3× speed unlocked: while you replay floors below your best, the ⏩ button next to Farm makes the game run 3× as fast' };
FEATURES.stars ={ at: STAR.at, name: '✧ Constellations unlocked (✦ Rebirth → ✧ Stars): new floors now pay Stardust' };

// ---------- 🌅 Awakening: the second prestige (from lap 3) ----------
// Trade every soul earned since the last Awakening (plus this run's rebirth) for Essence: floor((souls / 1B)^AWAKEN.exp).
// Resets souls, perks and the run (like a rebirth that pays no souls); everything else stays. Essence is never spent:
// each point gives +souls% from rebirths, +damage & health%, and raises some perk caps (levels per point, capped).
// (power 0.2 → 0.1: sim on the user's save, 10 Essence at ×3 got back to floor 825 in 20 min and a ~8× best rebirth)
// exp: Essence = (souls ÷ per)^exp, with souls counted WITHOUT Essence's own soul bonus (27 Sep: that bonus fed straight into
// the next Awakening, so gains snowballed: ~800K Essence by lap 5, and the user's next Awakening would have paid 30M. A flat
// 0.3 exponent was tried first and still paid 5.7M). version: saves below it get their Essence recalculated (see applyLoaded)
const AWAKEN = { at: 801, per: 1e9, exp: 1 / 3, version: 2, souls: 0.5, power: 0.1, caps: { slayer: [0.5, 30], companion: [0.5, 15], sweet: [0.5, 15], magnet: [0.5, 15], trophy: [0.5, 15], bounty: [0.5, 20], headstart: [0.2, 4] } };
FEATURES.awaken = { at: AWAKEN.at, name: '🌅 Awakening unlocked (✦ Rebirth → 🌅 Awaken): trade your souls for permanent Essence' };
{
  const A = (id, name, desc, test, prog, cos) => ACHIEVEMENTS.push({ cat: 'progress', id, name, desc, test, prog, cos });
  const stars = g => Object.values(g.stars || {}).reduce((a, b) => a + b, 0), all = Object.values(CONSTELLATIONS).reduce((a, c) => a + c.nodes.length, 0);
  A('star1', 'Stargazer', 'Light your first star in the Constellations', g => stars(g) >= 1);
  A('starAll', 'Written in the Sky', `Light all ${all} stars`, g => stars(g) >= all, g => [stars(g), all], 'aura_stars2');
  A('awaken1', 'Awakened', 'Awaken for the first time', g => (g.awakenings || 0) >= 1);
  A('essence25', 'Old Soul', 'Have 25 Essence', g => (g.essence || 0) >= 25, g => [g.essence || 0, 25], 'cape_dawn');
  COSMETICS.aura.items.aura_stars2 = { name: 'Starlit', colors: ['#ffffff', '#b3c7ff', '#e040fb'] };
  COSMETICS.cape.items.cape_dawn = { name: 'Dawn Mantle', pal: { C: '#ff8a65' }, glow: '#ffe082' };
}

// ---------- ☠ Boss Rush: every zone's Guardian and Lord in a row, each one tougher ----------
// the first boss is as strong as the toughest one you've beaten in a Boss Rush (none yet: this run's deepest floor),
// each next one `step` × that floor deeper (see rushStart in game.js).
// Only the bosses' item drops (at the floor they're fought at) are kept: no gold, XP, souls, gems or amulets.
const RUSH = { at: 60, cooldown: 30 * 60, step: 0.03, walk: 1.5 };
FEATURES.rush = { at: RUSH.at, name: '☠ Boss Rush unlocked (🏁 button in the title bar)' };
FEATURES.challenges = { at: 0, name: '🏁 Challenge runs unlocked (🏁 button in the title bar)' };

// challenge & boss rush achievements
{
  const A = (id, name, desc, test, prog, cos) => ACHIEVEMENTS.push({ cat: 'misc', id, name, desc, test, prog, cos });
  const done = g => Object.keys((g.chal && g.chal.done) || {}).length, n = Object.keys(CHALLENGES).length, rush = g => g.stats.rushBest || 0, bosses = 2 * ZONES.length;
  A('chal1', 'Challenger', 'Beat a challenge run', g => done(g) >= 1);
  A('chalAll', 'Champion', `Beat all ${n} challenge runs`, g => done(g) >= n, g => [done(g), n], 'aura_champ');
  A('rush10', 'Rush Hour', 'Defeat 10 bosses in one Boss Rush', g => rush(g) >= 10, g => [rush(g), 10]);
  A('rushAll', 'Unstoppable', `Defeat all ${bosses} bosses in one Boss Rush`, g => rush(g) >= bosses, g => [rush(g), bosses], 'aura_rush');
  A('fate1', 'Written in the Stars', 'Get a guaranteed jackpot item from 🌠 Fate', g => (g.stats.fated || 0) >= 1);
  COSMETICS.aura.items.aura_champ = { name: 'Champion', colors: ['#ffd54f', '#ffffff', '#ffb300'] };
  COSMETICS.aura.items.aura_rush = { name: 'Bloodrush', colors: ['#ff5252', '#ff8a80', '#b71c1c'] };
}

// =====================================================================================================
// Late-game systems, round 2 (the user found the late game repetitive): Expeditions, Laboratory, Oaths, World Events
// =====================================================================================================

// ---------- 🐾 Expeditions: send pets away for real time; they come back with loot and experience ----------
// secs = how long (real time: runs while the game is closed). Rewards scale with your laps (lapsF = laps done + 1).
// gems/insight flat; scrap × lapsF; dust × laps done (only once Stardust is unlocked); items = boss-quality items at your
// best floor; xp = pet experience. A pet's level (√(xp ÷ 2), max PET_MAX_LVL) makes its worn bonus +10% stronger per
// level and its expedition rewards +5% per level. A pet away on an expedition can't be worn.
const EXPEDITIONS = {
  scout: { name: 'Scouting Trip', icon: '🧭', secs: 30 * 60, gems: 1, scrap: 30, insight: 2, dust: 5, items: 0, xp: 1 },
  delve: { name: 'Deep Delve', icon: '⛏', secs: 2 * 3600, gems: 3, scrap: 120, insight: 6, dust: 20, items: 1, xp: 4 },
  voyage: { name: 'Long Voyage', icon: '🗺', secs: 8 * 3600, gems: 10, scrap: 500, insight: 20, dust: 80, items: 3, xp: 16 },
  // (depth pass) a mid-length loot run and an overnight-plus trip
  hunt: { name: 'Treasure Hunt', icon: '💰', secs: 4 * 3600, gems: 4, scrap: 400, insight: 8, dust: 30, items: 4, xp: 8 },
  pilgrim: { name: 'Pilgrimage', icon: '⛰', secs: 24 * 3600, gems: 30, scrap: 1500, insight: 60, dust: 250, items: 8, xp: 50 },
};
const EXPED = { at: 200, slots: 1 };
const PET_MAX_LVL = 30;  // (was 20)
FEATURES.exped = { at: EXPED.at, name: '🐾 Expeditions unlocked (🏁 button): send your pets away for loot' };

// ---------- 🧪 Laboratory: research projects that take real time, paid for with Insight ----------
// Insight: every boss floor beaten for the first time ever pays 1 + laps done (📚 more with Field Notes), each new Boss
// Rush record 2, and expeditions. One project at a time (two with Parallel Lab). fx: what it does (see labFx in game.js)
const LAB = { at: 250 };
const RESEARCH = {
  notes: { name: 'Field Notes', icon: '📚', cost: 10, hours: 0.5, desc: '+50% Insight from everything', fx: { insight: 1.5 } },
  mules: { name: 'Pack Mules', icon: '🐴', cost: 20, hours: 1, desc: '+1 expedition slot', fx: { slots: 1 } },
  autorush: { name: 'Rush Drill', icon: '☠', cost: 25, hours: 1, desc: 'Unlocks auto Boss Rush: starts one by itself whenever it\'s ready (toggle in the Boss Rush tab)', fx: { autoRush: 1 } },
  maps: { name: 'Treasure Maps', icon: '🗺', cost: 30, hours: 2, desc: 'Expeditions bring back +50% of everything', fx: { expLoot: 1.5 } },
  flux: { name: 'Tempering Flux', icon: '🔨', cost: 30, hours: 2, desc: 'Tempering costs 50% less scrap', fx: { temper: 0.5 } },
  homing: { name: 'Homing Pigeons', icon: '🕊', cost: 35, hours: 2, desc: 'Finished expeditions collect themselves and send the pet out again on the same trip', fx: { autoExp: 1 } },
  charts: { name: 'Star Charts', icon: '✧', cost: 40, hours: 3, desc: '+25% Stardust', fx: { dust: 1.25 } },
  distill: { name: 'Soul Distillery', icon: '✦', cost: 40, hours: 3, desc: '+30% souls from rebirths', fx: { souls: 1.3 } },
  pockets: { name: 'Deep Pockets', icon: '🎒', cost: 50, hours: 4, desc: '+250 stash space', fx: { stash: 250 } },
  dreams: { name: 'Dream Engine', icon: '🌙', cost: 60, hours: 4, desc: '+5% offline efficiency, and its cap +5%', fx: { offline: 0.05 } },
  oathlore: { name: 'Oath Lore', icon: '⚜', cost: 60, hours: 4, desc: 'Oath mastery grows twice as fast', fx: { oathXp: 2 } },
  beacon: { name: 'Event Beacon', icon: '📡', cost: 80, hours: 6, desc: 'World events come twice as often', fx: { events: 2 } },
  mules2: { name: 'Caravan', icon: '🐫', cost: 80, hours: 6, desc: '+1 expedition slot', fx: { slots: 1 } },
  lens: { name: 'Astral Lens', icon: '🔭', cost: 100, hours: 8, desc: '🌠 Fate counts 50% faster', fx: { fate: 1.5 } },
  metal: { name: 'Metallurgy', icon: '⚒', cost: 100, hours: 8, desc: 'Each reinforcement level is ×1.06 instead of ×1.05', fx: { forge: 1.06 } },
  parallel: { name: 'Parallel Lab', icon: '🧪', cost: 120, hours: 8, desc: 'Research two projects at once', fx: { labSlots: 1 } },
  theory: { name: 'Grand Theory', icon: '📜', cost: 200, hours: 12, desc: '×1.5 damage and health', fx: { atk: 1.5, hp: 1.5 } },
  // (depth pass) research that deepens the other systems
  sugar: { name: 'Sugar Chemistry', icon: '🍪', cost: 40, hours: 3, desc: 'Golden cookie buffs last 50% longer', fx: { cookieT: 1.5 } },
  studies: { name: 'Monster Studies', icon: '🔬', cost: 50, hours: 3, desc: 'Monsters with traits give 50% more gold and XP', fx: { traitRw: 1.5 } },
  anatomy: { name: 'Anatomy', icon: '🦴', cost: 60, hours: 4, desc: 'Bestiary damage bonuses are 50% stronger', fx: { beast: 1.5 } },
  carto: { name: 'Cartography', icon: '🧭', cost: 70, hours: 5, desc: 'Special stages show up twice as often', fx: { special: 2 } },
  tactics: { name: 'Battle Tactics', icon: '📐', cost: 90, hours: 6, desc: 'Skill cooldowns 15% shorter', fx: { cd: 0.85 } },
  gemcut: { name: 'Gemcutting', icon: '💠', cost: 100, hours: 8, desc: 'New amulets roll one extra bonus', fx: { charm: 1 } },
  settheory: { name: 'Set Theory', icon: '🛡', cost: 150, hours: 10, desc: 'Gear set bonuses are 50% stronger', fx: { sets: 1.5 } },
};
FEATURES.lab = { at: LAB.at, name: '🧪 Laboratory unlocked (🏁 button): research permanent upgrades with Insight' };

// ---------- ⚜ Oaths: one per run, a big upside and a downside (like Realm Grinder's factions) ----------
// Sworn right after a rebirth (while you're on floor ≤ OATH.pickUntil), then fixed for the run. Mastery: every new floor
// you beat under an Oath (not replays) is 1 mastery xp; level = √(xp ÷ 10), up to OATH.max; each level makes its upside
// OATH.per stronger (the downside stays). up/down: × multipliers (atk, hp, gold, xp, loot, souls, boss, mod, heal)
const OATH = { at: 300, pickUntil: 20, max: 20, per: 0.05 };
const OATHS = {
  berserker: { name: 'Berserker', icon: '🪓', color: '#ff7043', up: { atk: 2 }, down: { hp: 0.6 }, desc: 'Hit much harder, but you\'re fragile' },
  warden: { name: 'Warden', icon: '🛡', color: '#64b5f6', up: { hp: 2.2, heal: 1.5 }, down: { atk: 0.7 }, desc: 'Tough and self-healing, but softer hits' },
  merchant: { name: 'Merchant', icon: '💰', color: '#ffd54f', up: { gold: 4 }, down: { xp: 0.5 }, desc: 'Far more gold, less XP' },
  scholar: { name: 'Scholar', icon: '📘', color: '#80deea', up: { xp: 3, souls: 1.5 }, down: { gold: 0.5 }, desc: 'More XP and souls, less gold' },
  hunter: { name: 'Hunter', icon: '🏹', color: '#aed581', up: { loot: 2.5, mod: 1.3 }, down: { atk: 0.8 }, desc: 'Better loot and modifiers, weaker hits' },
  reaper: { name: 'Reaper', icon: '💀', color: '#ce93d8', up: { boss: 3 }, down: { hp: 0.8 }, desc: 'Bosses melt, but you take more punishment' },
  // (depth pass)
  gambler: { name: 'Gambler', icon: '🎲', color: '#f48fb1', up: { mod: 2.5 }, down: { gold: 0.7 }, desc: 'Modifiers everywhere, but lighter pockets' },
  pilgrim: { name: 'Pilgrim', icon: '🕯', color: '#e1bee7', up: { dust: 2, insight: 2 }, down: { atk: 0.85 }, desc: 'More Stardust and Insight, softer hits' },
  tyrant: { name: 'Tyrant', icon: '👑', color: '#ffb300', up: { atk: 1.5, hp: 1.5 }, down: { loot: 0.4, mod: 0.7 }, desc: 'Stronger all round, but loot dries up' },
};
FEATURES.oath = { at: OATH.at, name: '⚜ Oaths unlocked (✦ Rebirth → ⚜ Oath): swear one at the start of each run' };

// ---------- 🌍 World events: now and then a random 10-minute event changes the rules ----------
// Every EVENT.every minutes (random in that range, of play time; halved with the Event Beacon). fx hooks: eventFx in game.js
const EVENT = { at: 150, every: [45, 90], secs: 600 };
const WORLD_EVENTS = {
  bloodmoon: { name: 'Blood Moon', icon: '🌕', color: '#ff5252', desc: 'Monsters have ×2 health and damage, but drop ×3 loot', fx: { ehp: 2, eatk: 2, loot: 3 } },
  golden: { name: 'Golden Hour', icon: '💰', color: '#ffd54f', desc: '×5 gold from everything', fx: { gold: 5 } },
  meteor: { name: 'Meteor Shower', icon: '☄', color: '#e1bee7', desc: '×3 Stardust, and every floor (even a replay) drops a little', fx: { dust: 3, dustAll: 1 } },
  rain: { name: 'Treasure Rain', icon: '📦', color: '#ffb74d', desc: 'Treasure chests arrive every few seconds', fx: { chest: 8 } },
  lucky: { name: 'Lucky Streak', icon: '🍀', color: '#b9ffb0', desc: '×3 modifier chance', fx: { mod: 3 } },
  eureka: { name: 'Eureka', icon: '💡', color: '#80deea', desc: '×3 Insight, and research runs twice as fast', fx: { insight: 3, lab: 2 } },
  // (depth pass) wave = × monsters per floor, bossHp / bossLoot = × boss health / items, amulet = × amulet chance,
  // scrap = × scrap from salvaging, cookie = × how fast golden cookies come
  swarm: { name: 'The Swarm', icon: '🐜', color: '#aed581', desc: 'Twice as many monsters on every floor, ×1.5 gold and XP', fx: { wave: 2, gold: 1.5, xp: 1.5 } },
  eclipse: { name: 'Eclipse', icon: '🌑', color: '#b39ddb', desc: 'Bosses have ×2 health, but drop twice the items and ×3 amulets', fx: { bossHp: 2, bossLoot: 2, amulet: 3 } },
  harvest: { name: 'Scrap Harvest', icon: '🔩', color: '#b0bec5', desc: '×3 scrap from everything you sell', fx: { scrap: 3 } },
  festival: { name: 'Cookie Festival', icon: '🍪', color: '#ffcc80', desc: 'Golden cookies every half minute or so', fx: { cookie: 8 } },
};
FEATURES.events = { at: EVENT.at, name: '🌍 World events unlocked: every hour or so something unusual happens for 10 minutes' };

// achievements for the new systems
{
  const A = (id, name, desc, test, prog, cos) => ACHIEVEMENTS.push({ cat: 'misc', id, name, desc, test, prog, cos });
  const S = (g, k) => (g.stats && g.stats[k]) || 0, researched = g => Object.keys((g.lab && g.lab.done) || {}).length, nR = Object.keys(RESEARCH).length;
  A('exp1', 'Bon Voyage', 'Bring a pet home from an expedition', g => S(g, 'expeditions') >= 1);
  A('exp50', 'Seasoned Traveller', 'Finish 50 expeditions', g => S(g, 'expeditions') >= 50, g => [S(g, 'expeditions'), 50], 'cape_travel');
  A('petmax', 'Best Friend', `Raise a pet to level ${PET_MAX_LVL}`, g => Object.values(g.petXp || {}).some(x => Math.floor(Math.sqrt(x / 2)) >= PET_MAX_LVL));
  A('lab1', 'Eureka!', 'Finish a research project', g => researched(g) >= 1);
  A('labAll', 'Grand Theorist', `Finish all ${nR} research projects`, g => researched(g) >= nR, g => [researched(g), nR], 'helm_lab');
  A('oath1', 'Sworn', 'Swear an Oath', g => Object.keys(g.oathXp || {}).length >= 1 || !!g.oath);
  A('oathAll', 'Oathkeeper', `Reach mastery 10 with every Oath`, g => Object.keys(OATHS).every(k => Math.floor(Math.sqrt(((g.oathXp || {})[k] || 0) / 10)) >= 10), g => [Object.keys(OATHS).filter(k => Math.floor(Math.sqrt(((g.oathXp || {})[k] || 0) / 10)) >= 10).length, Object.keys(OATHS).length], 'aura_oath');
  A('event1', 'Something\'s Happening', 'See a world event', g => S(g, 'events') >= 1);
  A('event25', 'Storm Chaser', 'See 25 world events', g => S(g, 'events') >= 25, g => [S(g, 'events'), 25]);
  COSMETICS.cape.items.cape_travel = { name: 'Traveller\'s Cloak', pal: { C: '#6d4c41' } };
  COSMETICS.helm.items.helm_lab = { name: 'Goggles', y: 0, rows: ['...GGGGGG...', '....LG.LG...'], pal: { G: '#8d6e63', L: '#80deea' } };
  COSMETICS.aura.items.aura_oath = { name: 'Oathbound', colors: ['#ff7043', '#64b5f6', '#ce93d8'] };
}

// =====================================================================================================
// Depth pass (the user wanted more out of what's already there, not more tabs): achievements for it
// =====================================================================================================
{
  const A = (cat, id, name, desc, get, k, cos) => ACHIEVEMENTS.push({ cat, id, name, desc, test: g => get(g) >= k, prog: k > 1 ? g => [Math.min(get(g), k), k] : undefined, cos });
  const S = (g, k) => (g.stats && g.stats[k]) || 0, n = k => k.toLocaleString('en-US');
  const evos = g => Object.values(g.skillRank || {}).filter(r => r >= SKILL_RANKS.max).length, nSk = Object.keys(SKILLS).length;
  A('progress', 'evo1', 'Evolution', 'Train a skill to rank 10 and evolve it', evos, 1);
  A('progress', 'evoAll', 'Perfect Form', `Evolve all ${nSk} skills`, evos, nSk, 'aura_evolve');
  [[10, 'Champion Slayer'], [250, 'Champion of Champions', 'helm_champ']].forEach(([k, nm, c]) => A('combat', 'champ' + k, nm, `Defeat ${n(k)} Champions (monsters with two traits, from lap 2)`, g => S(g, 'champKills'), k, c));
  const fullSets = g => Object.keys(g.stats.setsFull || {}).length, nSets = Object.keys(GEAR_SETS).length;
  A('loot', 'set4', 'Full Set', 'Wear all 4 pieces of a gear set', fullSets, 1);
  A('loot', 'set4x5', 'Set Collector', 'Wear all 4 pieces of 5 different gear sets (not at once)', fullSets, 5, 'cape_sets');
  A('loot', 'setAll', 'Haute Couture', `Wear all 4 pieces of every one of the ${nSets} gear sets`, fullSets, nSets, 'aura_sets');
  const beast4 = g => Object.keys(g.bestiary || {}).filter(k => (g.bestiary[k] || 0) >= (k.startsWith('boss:') ? BESTIARY.bossTiers[3] : BESTIARY.tiers[3])).length;
  A('combat', 'beast4', 'Nature\'s Scholar', 'Reach bestiary tier 4 with any monster or boss', beast4, 1, 'helm_scholar');
  const evSeen = g => Object.keys(g.stats.eventSeen || {}).length, nEv = Object.keys(WORLD_EVENTS).length;
  A('misc', 'eventAll', 'Seen It All', `See every one of the ${nEv} world events`, evSeen, nEv, 'aura_events');
  [['double', 'Two Treats', 'Get the double cookie'], ['amuletc', 'Crumb of Fortune', 'Find an amulet in a golden cookie', 'weapon_crumb'], ['clover', 'Four Leaves', 'Get the four-leaf clover cookie']]
    .forEach(([id, nm, d, c]) => A('misc', 'ck_' + id, nm, d, g => ((g.stats.cookieSeen || {})[id] || 0), 1, c));
  A('misc', 'pilgrim1', 'Pilgrim\'s Progress', 'Bring a pet home from a Pilgrimage', g => S(g, 'pilgrimages'), 1, 'cape_pilgrim');
  A('combat', 'barrier', 'Breaking Point', 'Defeat a boss with three abilities (lap 3 and beyond)', g => S(g, 'tripleBoss'), 1);
  Object.assign(COSMETICS.aura.items, { aura_evolve: { name: 'Evolved', colors: ['#ffffff', '#7df9ff', '#ffd54f'] }, aura_sets: { name: 'Couture', rainbow: true },
    aura_events: { name: 'Weathervane', colors: ['#aed581', '#b39ddb', '#ffcc80'] } });
  Object.assign(COSMETICS.helm.items, { helm_champ: { name: 'Champion\'s Circlet', y: 0, rows: ['..YRYYYYRY..'], pal: { Y: '#ffd54f', R: '#e53935' } },
    helm_scholar: { name: 'Scholar\'s Cap', y: -2, rows: ['.KKKKKKKKKK.', '...KKKKKK...'], pal: { K: '#263238' } } });
  Object.assign(COSMETICS.cape.items, { cape_sets: { name: 'Patchwork Cape', pal: { C: '#8d6e63' }, glow: '#ffd54f' }, cape_pilgrim: { name: 'Pilgrim\'s Mantle', pal: { C: '#e1bee7' } } });
  COSMETICS.weapon.items.weapon_crumb = { name: 'Gingerbread', pal: { W: '#d7a86e' } };
}
