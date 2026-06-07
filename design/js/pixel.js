/* pixel.js — palette, low-level pixel helpers, parametric character + prop sprites
   Everything renders into a LOW-RES logical canvas; CSS scales it up with
   image-rendering: pixelated. 1 unit = 1 logical pixel. */
(function () {
  'use strict';

  // ---- Palette (night office, warm-blue cozy) ----------------------------
  const PAL = {
    // walls
    wallTop:   '#16213d',
    wall:      '#283a63',
    wallLit:   '#324a7a',
    wallDark:  '#1d2c4d',
    skirt:     '#11192e',
    // floor (wood)
    floorA:    '#7a5230',
    floorB:    '#6a4528',
    floorLine: '#4c2f1b',
    floorLit:  '#8a5f38',
    // rug
    rug:       '#5c2238',
    rugAlt:    '#2f7d7d',
    rugEdge:   '#c79a44',
    // window / night
    frame:     '#3a2a1c',
    frameLit:  '#5a4226',
    sky:       '#0c1530',
    skyHi:     '#142346',
    star:      '#cfe0ff',
    moon:      '#ffe9b0',
    // wood furniture
    deskTop:   '#7a5028',
    deskLeg:   '#52331c',
    deskEdge:  '#5d3b22',
    shelf:     '#634326',
    // tech
    monBody:   '#1c2129',
    monEdge:   '#0e1116',
    screen:    '#0b2422',
    chartG:    '#5fe08a',
    chartGd:   '#2f8a55',
    chartR:    '#ff6b6b',
    amber:     '#ffce63',
    cyan:      '#69d7e0',
    led:       '#5fe08a',
    ledRed:    '#ff5d5d',
    ledAmber:  '#ffb74d',
    metal:     '#525d70',
    metalHi:   '#6c7890',
    metalDk:   '#39414f',
    // light
    lampGlow:  'rgba(255,212,130,0.16)',
    monGlow:   'rgba(120,210,220,0.14)',
    // brand
    gold:      '#e8b945',
    goldHi:    '#f6d479',
    goldDk:    '#a87d24',
    ink:       '#0b0f1a',
    // generic
    black:     '#10131c',
    white:     '#e8eef7',
    shadow:    'rgba(0,0,0,0.28)'
  };

  // ---- low level ----------------------------------------------------------
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function hline(ctx, x, y, w, c) { rect(ctx, x, y, w, 1, c); }
  function vline(ctx, x, y, h, c) { rect(ctx, x, y, 1, h, c); }

  /* draw a string-grid sprite. grid = array of strings; map = {char:color|null} */
  function blit(ctx, grid, map, ox, oy) {
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const c = map[row[x]];
        if (c) px(ctx, ox + x, oy + y, c);
      }
    }
  }

  // ---- Parametric character ----------------------------------------------
  // Base human grid (12 wide x 18 tall). markers recolored per agent.
  const BASE = [
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HFFFFFFH..',
    '..HFFFFFFH..',
    '..FFEFFEFF..',
    '..FFFFFFFF..',
    '...FFFFFF...',
    '....SSSS....',
    '..ASSSSSSA..',
    '..ASSSSSSA..',
    '..ASSSSSSA..',
    '..ASSSSSSA..',
    '...SSSSSS...',
    '...LLLLLL...',
    '...LLLLLL...',
    '...LL..LL...',
    '...LL..LL...',
    '...BB..BB...'
  ];
  // alt legs for walk frame
  const LEGS_A = ['...LL..LL...', '...LL..LL...', '...BB..BB...'];
  const LEGS_B = ['..LL....LL..', '..LL....LL..', '..BB....BB..'];

  function shade(hex, amt) {
    // amt -1..1 darken/lighten
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, t = Math.abs(amt);
    r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* cfg: {hair, skin, shirt, pants, acc, accColor}
     frame: 0/1 (walk), state: 'walk'|'idle'|'sit', facing: 1 right / -1 left */
  function drawCharacter(ctx, ox, oy, cfg, frame, state, facing) {
    ox = ox | 0; oy = oy | 0;
    const hair = cfg.hair, skin = cfg.skin, shirt = cfg.shirt, pants = cfg.pants || '#34507a';
    const eye = '#1a1f2b';
    const skinSh = shade(skin, -0.18), shirtSh = shade(shirt, -0.2), hairSh = shade(hair, -0.25);

    // build working grid
    let grid = BASE.slice();
    if (state === 'walk') {
      const legs = frame ? LEGS_B : LEGS_A;
      grid = grid.slice(0, 15).concat(legs);
    } else if (state === 'sit') {
      // upper body only (legs occluded by desk); arms forward
      grid = BASE.slice(0, 13).concat(['...AAAAAA...', '...A....A...']);
    }

    const map = { H: hair, F: skin, E: eye, S: shirt, A: skin, L: pants, B: '#241b12', '.': null };

    // soft shadow under feet
    if (state !== 'sit') rect(ctx, ox + 2, oy + 18, 8, 1, PAL.shadow);

    blit(ctx, grid, map, ox, oy);

    // simple shading: darker right edge of shirt + hair shine
    px(ctx, ox + 8, oy + 8, shirtSh); px(ctx, ox + 8, oy + 11, shirtSh);
    px(ctx, ox + 3, oy + 1, shade(hair, 0.25));
    px(ctx, ox + 9, oy + 3, hairSh);
    // skin shading on cheek
    px(ctx, ox + 8, oy + 5, skinSh);

    // facing: nudge eyes
    if (facing < 0) { px(ctx, ox + 3, oy + 4, eye); px(ctx, ox + 6, oy + 4, eye); rect(ctx, ox + 7, oy + 4, 2, 1, skin); }
    else if (facing > 0) { /* default eyes ok */ }

    // ---- accessories ----
    const ac = cfg.accColor || PAL.metal;
    switch (cfg.acc) {
      case 'cap': // SCANNER — green cap with brim
        rect(ctx, ox + 2, oy, 8, 2, ac);
        rect(ctx, ox + 1, oy + 1, 4, 1, shade(ac, -0.2)); // brim left
        px(ctx, ox + 5, oy, shade(ac, 0.3));
        break;
      case 'glasses': // HAWK — analyst glasses
        rect(ctx, ox + 3, oy + 4, 2, 1, '#0c0f16');
        rect(ctx, ox + 6, oy + 4, 2, 1, '#0c0f16');
        px(ctx, ox + 5, oy + 4, '#0c0f16');
        px(ctx, ox + 3, oy + 4, PAL.cyan);
        break;
      case 'robe': { // SAGE — long robe + beard
        const robe = shirt;
        for (let y = 13; y < 18; y++) rect(ctx, ox + 2, oy + y, 8, 1, y % 2 ? shade(robe, -0.12) : robe);
        // beard
        rect(ctx, ox + 3, oy + 6, 6, 2, '#cfd3da'); px(ctx, ox + 4, oy + 5, '#cfd3da'); px(ctx, ox + 7, oy + 5, '#cfd3da');
        // little hat trim
        rect(ctx, ox + 3, oy, 6, 1, shade(robe, 0.2));
        break; }
      case 'robot': { // IRON — metal head + visor + antenna
        // overwrite face with metal
        rect(ctx, ox + 3, oy + 2, 6, 5, PAL.metal);
        rect(ctx, ox + 3, oy + 4, 6, 1, PAL.cyan); // visor
        px(ctx, ox + 5, oy + 4, '#0c1418');
        rect(ctx, ox + 2, oy + 1, 8, 1, PAL.metalHi);
        // antenna
        vline(ctx, ox + 5, oy - 2, 2, PAL.metalHi); px(ctx, ox + 5, oy - 3, PAL.ledRed);
        // chest LED
        px(ctx, ox + 5, oy + 9, PAL.led);
        break; }
      case 'headset': // AURUM — headset band + mic
        rect(ctx, ox + 2, oy + 1, 8, 1, '#2a2f3a');
        px(ctx, ox + 2, oy + 3, '#2a2f3a'); px(ctx, ox + 9, oy + 3, '#2a2f3a');
        px(ctx, ox + 2, oy + 5, PAL.gold); // mic boom tip
        break;
    }
  }

  PixelArt = { PAL, px, rect, hline, vline, blit, drawCharacter, shade };
  window.PixelArt = PixelArt;
})();
var PixelArt;
