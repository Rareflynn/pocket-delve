// Renders one square picture per zone (background + its Lord + the hero) for Discord Rich Presence.
// Run through zone_art.py, which saves the POSTed zone_<slug>.png files into discord/zones.
(() => {
  const N = 128, OUT = 512, slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const big = document.createElement('canvas'); big.width = big.height = OUT;
  const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false;
  const keep = { w: VIEW.w, h: VIEW.h, s: VIEW.s, ground: VIEW.ground }, cw = cv.width, ch = cv.height;
  cv.width = cv.height = N; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  Object.assign(VIEW, { w: N, h: N, s: 4, ground: N - 14 });
  const t0 = RT.t, sc0 = RT.scroll, rush = RT.rush; RT.t = 1.3; RT.scroll = 40; RT.rush = null;
  const done = [];
  ZONES.forEach((z, i) => {
    G.floor = i * FLOORS_PER_ZONE + 1;
    ctx.clearRect(0, 0, N, N); drawBg();
    const g = VIEW.ground;
    drawSprite(z.boss.sprite, z.boss.pal, N * 0.64, g, 7, true);  // the Lord, facing the hero
    drawHero(N * 0.2, g, 3);
    bx.clearRect(0, 0, OUT, OUT); bx.drawImage(cv, 0, 0, OUT, OUT);
    const bin = atob(big.toDataURL('image/png').split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const x = new XMLHttpRequest(); x.open('POST', '/save/zone_' + slug(z.name) + '.png', false); x.send(bytes);
    done.push(slug(z.name));
  });
  RT.t = t0; RT.scroll = sc0; RT.rush = rush; Object.assign(VIEW, keep); cv.width = cw; cv.height = ch;
  return JSON.stringify(done);
})();
