// ============================================================
// NEON SURVIVORS — 2D Roguelike Shooter
// ============================================================
'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ======================== AUDIO ENGINE ========================
let audioCtx = null;
function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const SFX_VOLUME = 0.12; // master volume — keep minimal

function playTone(freq, dur, type, vol, slide) {
    if (!audioCtx) return;
    const g = audioCtx.createGain();
    const o = audioCtx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, audioCtx.currentTime + dur);
    g.gain.setValueAtTime((vol || 1) * SFX_VOLUME, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
}

function playNoise(dur, vol) {
    if (!audioCtx) return;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime((vol || 0.5) * SFX_VOLUME, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    // bandpass for crunch
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 1200; filt.Q.value = 0.8;
    src.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
    src.start(); src.stop(audioCtx.currentTime + dur);
}

// Sound presets
const sfx = {
    pistol: () => { playTone(600, 0.08, 'square', 0.6, 200); playNoise(0.06, 0.3); },
    shotgun: () => { playNoise(0.12, 0.8); playTone(200, 0.1, 'sawtooth', 0.4, 80); },
    smg: () => { playTone(900, 0.04, 'square', 0.35, 400); },
    laser: () => { playTone(1400, 0.15, 'sine', 0.5, 600); playTone(1800, 0.12, 'sine', 0.2, 900); },
    rocket: () => { playNoise(0.2, 0.9); playTone(100, 0.3, 'sawtooth', 0.5, 40); },
    hit: () => { playTone(300, 0.06, 'square', 0.3, 100); },
    kill: () => { playTone(500, 0.1, 'square', 0.3, 150); playTone(700, 0.08, 'sine', 0.2, 200); },
    gem: () => { playTone(800, 0.08, 'sine', 0.3, 1200); },
    powerup: () => { playTone(400, 0.15, 'sine', 0.4, 800); playTone(600, 0.2, 'sine', 0.3, 1200); },
    hurt: () => { playTone(200, 0.15, 'sawtooth', 0.5, 80); playNoise(0.1, 0.4); },
    dash: () => { playTone(300, 0.1, 'sine', 0.3, 900); },
    explode: () => { playNoise(0.25, 1); playTone(80, 0.3, 'sawtooth', 0.4, 30); },
    gameover: () => { playTone(400, 0.3, 'sawtooth', 0.5, 100); setTimeout(() => playTone(200, 0.5, 'sawtooth', 0.4, 60), 300); },
};

// ======================== CONSTANTS ========================
const WORLD_SIZE = 4000;
const PLAYER_SPEED = 220;
const DASH_SPEED = 700;
const DASH_DURATION = 0.15;
const DASH_COOLDOWN = 1.5;
const GEM_MAGNET_RANGE = 120;
const GEM_COLLECT_RANGE = 25;
const MAX_ENEMIES = 80;
const PLAYER_MAX_HP = 100;
const PLAYER_LIVES = 5;
const INVULN_TIME = 1.5;

// ======================== WEAPONS ========================
const WEAPONS = [
    {
        id: 'pistol', name: 'Pistol', icon: '🔫', color: '#00ffff', fireRate: 0.25, bulletSpeed: 600, damage: 1,
        spread: 0, count: 1, lifetime: 1.2, bulletSize: 3.5, pierce: false, explosive: false, key: '1'
    },
    {
        id: 'shotgun', name: 'Shotgun', icon: '💥', color: '#ff8844', fireRate: 0.6, bulletSpeed: 500, damage: 1,
        spread: 0.35, count: 6, lifetime: 0.5, bulletSize: 2.5, pierce: false, explosive: false, key: '2'
    },
    {
        id: 'smg', name: 'SMG', icon: '🔥', color: '#ffdd00', fireRate: 0.08, bulletSpeed: 550, damage: 0.5,
        spread: 0.12, count: 1, lifetime: 0.8, bulletSize: 2.5, pierce: false, explosive: false, key: '3'
    },
    {
        id: 'laser', name: 'Laser Rifle', icon: '⚡', color: '#aa66ff', fireRate: 0.35, bulletSpeed: 1200, damage: 2,
        spread: 0, count: 1, lifetime: 0.8, bulletSize: 2, pierce: true, explosive: false, key: '4'
    },
    {
        id: 'rocket', name: 'Rocket', icon: '🚀', color: '#ff3344', fireRate: 0.9, bulletSpeed: 350, damage: 3,
        spread: 0, count: 1, lifetime: 1.8, bulletSize: 5, pierce: false, explosive: true, key: '5'
    },
];

// Power-up thresholds
const POWERUPS = [
    { gems: 25, type: 'speed', name: 'Speed Boost', icon: '💨', dur: 12, color: '#00ff88' },
    { gems: 50, type: 'rapid', name: 'Rapid Fire', icon: '🔥', dur: 12, color: '#ff6600' },
    { gems: 100, type: 'multi', name: 'Multi-Shot', icon: '🔱', dur: 15, color: '#aa66ff' },
    { gems: 150, type: 'shield', name: 'Shield', icon: '🛡️', dur: 20, color: '#00aaff' },
];

// Enemy definitions
const ENEMY_TYPES = {
    chaser: { hp: 1, speed: 100, size: 14, color: '#ff4455', dmg: 12, score: 10, gemType: 0 },
    dasher: { hp: 1, speed: 70, size: 12, color: '#ff8800', dmg: 15, score: 20, gemType: 1 },
    tank: { hp: 5, speed: 55, size: 22, color: '#aa44ff', dmg: 25, score: 50, gemType: 2 },
    splitter: { hp: 2, speed: 90, size: 16, color: '#44dd66', dmg: 10, score: 30, gemType: 3 },
};

const GEM_COLORS = ['#4488ff', '#44ff88', '#ffcc00', '#cc66ff'];
const GEM_VALUES = [1, 2, 5, 3];

// ======================== STATE ========================
let state = 'menu';
let W, H;
let camera = { x: 0, y: 0 };
let screenShake = { x: 0, y: 0, intensity: 0 };
let gameTime = 0, spawnTimer = 0, waveNum = 1, waveTimer = 0;

const keys = {};
let mouse = { x: 0, y: 0, down: false };

let player, bullets = [], enemies = [], gems = [], particles = [], damageNumbers = [];
let activePowerups = [];
let currentWeaponIdx = 0;

// ======================== CONTROL MODE ========================
let controlMode = 'keyboard'; // 'keyboard' | 'touch'
let joystick = { active: false, dx: 0, dy: 0, touchId: null };
let touchShootDown = false;
let touchDashDown = false;

// ======================== UTILITY ========================
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    checkOrientation();
}
window.addEventListener('resize', resize);
resize();

// ======================== LANDSCAPE LOCK ========================
function isMobileDevice() {
    return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
function checkOrientation() {
    const lock = document.getElementById('landscape-lock');
    const isPortrait = window.innerHeight > window.innerWidth;
    if (controlMode === 'touch' && isPortrait && isMobileDevice()) {
        lock.classList.remove('hidden');
    } else {
        lock.classList.add('hidden');
    }
}
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));

// ======================== PLAYER ========================
function createPlayer() {
    return {
        x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, vx: 0, vy: 0,
        hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
        lives: PLAYER_LIVES, score: 0, gems: 0, kills: 0,
        angle: 0, fireTimer: 0, invulnTimer: 0,
        dashTimer: 0, dashCooldown: 0, dashAngle: 0,
        size: 16, speedMult: 1, fireRateMult: 1, multiShot: false, shield: 0,
    };
}

// ======================== KEYBOARD / MOUSE INPUT ========================
window.addEventListener('keydown', e => {
    if (controlMode !== 'keyboard') return;
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code >= 'Digit1' && e.code <= 'Digit5') {
        const idx = parseInt(e.code[5]) - 1;
        if (idx >= 0 && idx < WEAPONS.length) { currentWeaponIdx = idx; ensureAudio(); }
    }
    if (e.code === 'KeyQ') { currentWeaponIdx = (currentWeaponIdx - 1 + WEAPONS.length) % WEAPONS.length; }
    if (e.code === 'KeyE') { currentWeaponIdx = (currentWeaponIdx + 1) % WEAPONS.length; }
});
window.addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('mousemove', e => { if (controlMode === 'keyboard') { mouse.x = e.clientX; mouse.y = e.clientY; } });
canvas.addEventListener('mousedown', e => { if (controlMode === 'keyboard') { mouse.down = true; ensureAudio(); } e.preventDefault(); });
canvas.addEventListener('mouseup', () => { if (controlMode === 'keyboard') mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
    if (state !== 'playing' || controlMode !== 'keyboard') return;
    currentWeaponIdx = (currentWeaponIdx + (e.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length;
    e.preventDefault();
}, { passive: false });

// ======================== TOUCH JOYSTICK & BUTTONS ========================
const joystickBase = document.getElementById('joystick-base');
const joystickThumb = document.getElementById('joystick-thumb');
const joystickZone = document.getElementById('joystick-zone');

function getJoystickCenter() {
    const r = joystickBase.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

joystickZone.addEventListener('touchstart', e => {
    if (controlMode !== 'touch') return;
    e.preventDefault(); e.stopPropagation(); ensureAudio();
    const t = e.changedTouches[0];
    joystick.active = true; joystick.touchId = t.identifier;
    updateJoystickFromTouch(t);
    joystickThumb.classList.add('active');
}, { passive: false });

joystickZone.addEventListener('touchmove', e => {
    if (controlMode !== 'touch') return;
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
        if (t.identifier === joystick.touchId) updateJoystickFromTouch(t);
    }
}, { passive: false });

joystickZone.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
        if (t.identifier === joystick.touchId) resetJoystick();
    }
}, { passive: false });
joystickZone.addEventListener('touchcancel', () => resetJoystick());

function updateJoystickFromTouch(t) {
    const c = getJoystickCenter();
    let dx = t.clientX - c.x, dy = t.clientY - c.y;
    const maxR = 45;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
    joystick.dx = dx / maxR; joystick.dy = dy / maxR;
    joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function resetJoystick() {
    joystick.active = false; joystick.dx = 0; joystick.dy = 0; joystick.touchId = null;
    joystickThumb.style.transform = 'translate(-50%, -50%)';
    joystickThumb.classList.remove('active');
}

// Touch shoot button
const shootBtn = document.getElementById('touch-shoot-btn');
shootBtn.addEventListener('touchstart', e => {
    if (controlMode !== 'touch') return;
    e.preventDefault(); e.stopPropagation(); ensureAudio();
    touchShootDown = true; shootBtn.classList.add('active');
}, { passive: false });
shootBtn.addEventListener('touchend', e => {
    e.preventDefault(); touchShootDown = false; shootBtn.classList.remove('active');
}, { passive: false });
shootBtn.addEventListener('touchcancel', () => { touchShootDown = false; shootBtn.classList.remove('active'); });

// Touch dash button
const dashBtn = document.getElementById('touch-dash-btn');
dashBtn.addEventListener('touchstart', e => {
    if (controlMode !== 'touch') return;
    e.preventDefault(); e.stopPropagation(); ensureAudio();
    touchDashDown = true; dashBtn.classList.add('active');
}, { passive: false });
dashBtn.addEventListener('touchend', e => {
    e.preventDefault(); touchDashDown = false; dashBtn.classList.remove('active');
}, { passive: false });
dashBtn.addEventListener('touchcancel', () => { touchDashDown = false; dashBtn.classList.remove('active'); });

// Touch weapon switcher
document.getElementById('touch-wpn-prev').addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation(); ensureAudio();
    currentWeaponIdx = (currentWeaponIdx - 1 + WEAPONS.length) % WEAPONS.length;
    updateTouchWeaponLabel();
}, { passive: false });
document.getElementById('touch-wpn-next').addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation(); ensureAudio();
    currentWeaponIdx = (currentWeaponIdx + 1) % WEAPONS.length;
    updateTouchWeaponLabel();
}, { passive: false });

function updateTouchWeaponLabel() {
    const el = document.getElementById('touch-wpn-name');
    if (el) el.textContent = WEAPONS[currentWeaponIdx].name;
}

// ======================== CONTROL MODE SELECTION ========================
const btnKeyboard = document.getElementById('btn-keyboard');
const btnTouch = document.getElementById('btn-touch');
btnKeyboard.classList.add('active');

btnKeyboard.addEventListener('click', () => {
    controlMode = 'keyboard';
    btnKeyboard.classList.add('active'); btnTouch.classList.remove('active');
    document.getElementById('keyboard-controls-info').classList.remove('hidden');
    document.getElementById('touch-controls-info').classList.add('hidden');
    document.body.classList.remove('touch-mode');
    checkOrientation();
});
btnTouch.addEventListener('click', () => {
    controlMode = 'touch';
    btnTouch.classList.add('active'); btnKeyboard.classList.remove('active');
    document.getElementById('touch-controls-info').classList.remove('hidden');
    document.getElementById('keyboard-controls-info').classList.add('hidden');
    document.body.classList.add('touch-mode');
    checkOrientation();
});

// Auto-detect mobile — check user agent for phone/tablet AND touch support
const isMobile = isMobileDevice() && /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
if (isMobile) {
    btnTouch.click();
}

// ======================== START / RESTART ========================
document.getElementById('start-btn').addEventListener('click', () => { ensureAudio(); startGame(); });
document.getElementById('restart-btn').addEventListener('click', () => { ensureAudio(); startGame(); });

function startGame() {
    player = createPlayer();
    bullets = []; enemies = []; gems = []; particles = []; damageNumbers = []; activePowerups = [];
    gameTime = 0; spawnTimer = 0; waveNum = 1; waveTimer = 0; currentWeaponIdx = 0;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    if (controlMode === 'touch') document.getElementById('touch-controls').classList.remove('hidden');
    else document.getElementById('touch-controls').classList.add('hidden');
    updateTouchWeaponLabel();
    state = 'playing';
}

// ======================== SPAWN ENEMIES ========================
function spawnEnemy(type, x, y) {
    if (enemies.length >= MAX_ENEMIES) return;
    const def = ENEMY_TYPES[type];
    if (!x) {
        const a = rand(0, Math.PI * 2), d = rand(500, 800);
        x = player.x + Math.cos(a) * d; y = player.y + Math.sin(a) * d;
    }
    x = clamp(x, 50, WORLD_SIZE - 50); y = clamp(y, 50, WORLD_SIZE - 50);
    enemies.push({
        x, y, vx: 0, vy: 0, hp: def.hp, maxHp: def.hp, type, size: def.size,
        dashTimer: 0, dashCooldown: rand(1, 3), flashTimer: 0
    });
}

function updateSpawner(dt) {
    const rate = 1 + gameTime * 0.01;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
        spawnTimer = 1 / rate;
        const types = ['chaser'];
        if (gameTime > 30) types.push('dasher');
        if (gameTime > 60) types.push('tank');
        if (gameTime > 90) types.push('splitter');
        const count = Math.min(3, 1 + Math.floor(gameTime / 60));
        for (let i = 0; i < count; i++) spawnEnemy(types[randInt(0, types.length - 1)]);
    }
    waveTimer += dt;
    if (waveTimer >= 30) { waveTimer = 0; waveNum++; }
}

// ======================== PARTICLES ========================
function spawnParticles(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
        particles.push({
            x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            life: rand(life * 0.5, life), maxLife: life, size: rand(2, 5), color
        });
    }
}
function spawnDamageNumber(x, y, text, color) {
    damageNumbers.push({ x, y, text: String(text), color, life: 0.8, maxLife: 0.8 });
}

// ======================== BULLETS / WEAPONS ========================
function getAimAngle() {
    if (controlMode === 'touch') {
        // Auto-aim: find nearest enemy
        let nearest = null, nd = Infinity;
        for (const e of enemies) {
            const d = dist(player, e);
            if (d < nd) { nd = d; nearest = e; }
        }
        if (nearest) return angle(player, nearest);
        // If no enemies, aim in movement direction or default right
        if (joystick.active && (joystick.dx || joystick.dy)) return Math.atan2(joystick.dy, joystick.dx);
        return player.angle;
    }
    const worldMouse = { x: mouse.x - W / 2 + camera.x, y: mouse.y - H / 2 + camera.y };
    return angle(player, worldMouse);
}

function fireBullet() {
    const w = WEAPONS[currentWeaponIdx];
    const baseAngle = getAimAngle();

    for (let i = 0; i < w.count; i++) {
        let a = baseAngle;
        if (w.count > 1) {
            a = baseAngle - w.spread / 2 + (w.spread / (w.count - 1)) * i + rand(-0.03, 0.03);
        } else if (w.spread > 0) {
            a += rand(-w.spread, w.spread);
        }
        if (player.multiShot && w.count === 1) {
            if (i === 0) { pushBullet(a, w); pushBullet(a - 0.18, w); pushBullet(a + 0.18, w); }
        } else { pushBullet(a, w); }
    }
    if (sfx[w.id]) sfx[w.id]();
}

function pushBullet(a, w) {
    bullets.push({
        x: player.x + Math.cos(a) * 22, y: player.y + Math.sin(a) * 22,
        vx: Math.cos(a) * w.bulletSpeed, vy: Math.sin(a) * w.bulletSpeed,
        life: w.lifetime, dmg: w.damage, size: w.bulletSize,
        pierce: w.pierce, explosive: w.explosive, weaponId: w.id,
        color: w.color, hitEnemies: [],
    });
}

function updatePlayer(dt) {
    let mx = 0, my = 0;
    if (controlMode === 'touch') {
        mx = joystick.dx; my = joystick.dy;
    } else {
        if (keys['KeyW'] || keys['ArrowUp']) my = -1;
        if (keys['KeyS'] || keys['ArrowDown']) my = 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mx = -1;
        if (keys['KeyD'] || keys['ArrowRight']) mx = 1;
    }
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;
    const speed = PLAYER_SPEED * player.speedMult;

    // Dash
    const dashPressed = controlMode === 'touch' ? touchDashDown : keys['Space'];
    player.dashCooldown -= dt;
    if (dashPressed && player.dashCooldown <= 0 && (mx || my)) {
        player.dashTimer = DASH_DURATION; player.dashCooldown = DASH_COOLDOWN;
        player.dashAngle = Math.atan2(my, mx);
        spawnParticles(player.x, player.y, '#00ffff', 8, 150, 0.3);
        sfx.dash();
        if (controlMode === 'touch') touchDashDown = false;
    }
    if (player.dashTimer > 0) {
        player.dashTimer -= dt;
        player.x += Math.cos(player.dashAngle) * DASH_SPEED * dt;
        player.y += Math.sin(player.dashAngle) * DASH_SPEED * dt;
    } else {
        player.x += mx * speed * dt; player.y += my * speed * dt;
    }
    player.x = clamp(player.x, 20, WORLD_SIZE - 20);
    player.y = clamp(player.y, 20, WORLD_SIZE - 20);

    // Aim
    player.angle = getAimAngle();

    // Shoot
    const shooting = controlMode === 'touch' ? touchShootDown : mouse.down;
    const w = WEAPONS[currentWeaponIdx];
    player.fireTimer -= dt;
    if (shooting && player.fireTimer <= 0) {
        player.fireTimer = w.fireRate / player.fireRateMult;
        fireBullet();
    }
    if (player.invulnTimer > 0) player.invulnTimer -= dt;
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < 0 || b.x > WORLD_SIZE || b.y < 0 || b.y > WORLD_SIZE) {
            if (b.explosive) explode(b.x, b.y);
            bullets.splice(i, 1); continue;
        }
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (b.hitEnemies.includes(j)) continue;
            if (dist(b, e) < e.size + b.size) {
                e.hp -= b.dmg; e.flashTimer = 0.1;
                spawnParticles(b.x, b.y, ENEMY_TYPES[e.type].color, 4, 100, 0.3);
                spawnDamageNumber(e.x, e.y - e.size, b.dmg, '#ffffff');
                sfx.hit();
                if (b.pierce) { b.hitEnemies.push(j); }
                else if (b.explosive) { explode(b.x, b.y); hit = true; }
                else { hit = true; }
                if (e.hp <= 0) killEnemy(j);
                if (hit) break;
            }
        }
        if (hit) bullets.splice(i, 1);
    }
}

function explode(x, y) {
    sfx.explode();
    spawnParticles(x, y, '#ff4400', 20, 250, 0.5);
    spawnParticles(x, y, '#ffcc00', 10, 180, 0.4);
    screenShake.intensity = 10;
    // AoE damage
    const RADIUS = 80;
    for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (dist({ x, y }, e) < RADIUS) {
            e.hp -= 2; e.flashTimer = 0.15;
            spawnDamageNumber(e.x, e.y - e.size, 2, '#ff8800');
            if (e.hp <= 0) killEnemy(j);
        }
    }
}

function killEnemy(idx) {
    const e = enemies[idx];
    const def = ENEMY_TYPES[e.type];
    player.score += def.score;
    player.kills++;
    spawnParticles(e.x, e.y, def.color, 12, 180, 0.5);
    screenShake.intensity = 4;
    sfx.kill();
    gems.push({
        x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), type: def.gemType, life: 30,
        bobPhase: rand(0, Math.PI * 2), sparkle: 0
    });
    if (e.type === 'splitter') {
        for (let k = 0; k < 2; k++) spawnEnemy('chaser', e.x + rand(-30, 30), e.y + rand(-30, 30));
    }
    enemies.splice(idx, 1);
}

function updateEnemies(dt) {
    for (const e of enemies) {
        const def = ENEMY_TYPES[e.type];
        const a = angle(e, player);
        let speed = def.speed;
        if (e.type === 'dasher') {
            e.dashCooldown -= dt;
            if (e.dashCooldown <= 0 && dist(e, player) < 300) {
                e.dashTimer = 0.25; e.dashCooldown = rand(2, 4);
                e.vx = Math.cos(a) * 400; e.vy = Math.sin(a) * 400;
            }
            if (e.dashTimer > 0) { e.dashTimer -= dt; e.x += e.vx * dt; e.y += e.vy * dt; }
            else { e.x += Math.cos(a) * speed * dt; e.y += Math.sin(a) * speed * dt; }
        } else {
            e.x += Math.cos(a) * speed * dt; e.y += Math.sin(a) * speed * dt;
        }
        e.x = clamp(e.x, 10, WORLD_SIZE - 10); e.y = clamp(e.y, 10, WORLD_SIZE - 10);
        if (e.flashTimer > 0) e.flashTimer -= dt;

        if (player.invulnTimer <= 0 && dist(e, player) < e.size + player.size) {
            if (player.shield > 0) {
                player.shield--;
                spawnParticles(player.x, player.y, '#00aaff', 8, 150, 0.4);
                spawnDamageNumber(player.x, player.y - 20, 'BLOCKED', '#00aaff');
            } else {
                player.hp -= def.dmg;
                spawnParticles(player.x, player.y, '#ff3366', 10, 150, 0.4);
                spawnDamageNumber(player.x, player.y - 20, def.dmg, '#ff3366');
                screenShake.intensity = 8;
                sfx.hurt();
            }
            player.invulnTimer = INVULN_TIME;
            const ka = angle(e, player);
            player.x += Math.cos(ka) * 40; player.y += Math.sin(ka) * 40;
            if (player.hp <= 0) {
                player.lives--;
                if (player.lives <= 0) { gameOver(); return; }
                player.hp = player.maxHp; player.invulnTimer = 2;
                spawnParticles(player.x, player.y, '#ff3366', 20, 200, 0.6);
            }
        }
    }
}

function updateGems(dt) {
    for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        g.life -= dt; g.bobPhase += dt * 3; g.sparkle += dt;
        if (g.life <= 0) { gems.splice(i, 1); continue; }
        const d = dist(g, player);
        if (d < GEM_MAGNET_RANGE) {
            const a = angle(g, player), pull = (1 - d / GEM_MAGNET_RANGE) * 400;
            g.x += Math.cos(a) * pull * dt; g.y += Math.sin(a) * pull * dt;
        }
        if (d < GEM_COLLECT_RANGE) {
            player.gems += GEM_VALUES[g.type]; player.score += GEM_VALUES[g.type] * 5;
            spawnParticles(g.x, g.y, GEM_COLORS[g.type], 6, 80, 0.3);
            sfx.gem();
            gems.splice(i, 1);
            checkPowerups();
        }
    }
}

function checkPowerups() {
    for (const pu of POWERUPS) {
        if (player.gems >= pu.gems && !activePowerups.find(a => a.type === pu.type && a.threshold === pu.gems)) {
            activatePowerup(pu);
        }
    }
    const repeat = Math.floor((player.gems - 200) / 200);
    if (repeat >= 0) {
        const key = 'repeat_' + repeat;
        if (!activePowerups.find(a => a.key === key)) {
            activatePowerup(POWERUPS[randInt(0, POWERUPS.length - 1)], key);
        }
    }
}

function activatePowerup(pu, key) {
    activePowerups.push({
        type: pu.type, name: pu.name, icon: pu.icon, color: pu.color,
        timer: pu.dur, maxTimer: pu.dur, threshold: pu.gems, key: key || null
    });
    applyPowerup(pu.type, true);
    showLevelUp(pu.name + '!');
    spawnParticles(player.x, player.y, pu.color, 20, 200, 0.6);
    sfx.powerup();
}

function applyPowerup(type, on) {
    if (type === 'speed') player.speedMult = on ? 1.4 : 1;
    if (type === 'rapid') player.fireRateMult = on ? 2 : 1;
    if (type === 'multi') player.multiShot = on;
    if (type === 'shield' && on) player.shield = 3;
}

function updatePowerups(dt) {
    for (let i = activePowerups.length - 1; i >= 0; i--) {
        const p = activePowerups[i]; p.timer -= dt;
        if (p.timer <= 0) { applyPowerup(p.type, false); activePowerups.splice(i, 1); }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
        p.life -= dt; if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        const d = damageNumbers[i]; d.y -= 40 * dt; d.life -= dt;
        if (d.life <= 0) damageNumbers.splice(i, 1);
    }
}

function updateCamera() {
    camera.x = lerp(camera.x, player.x, 0.1); camera.y = lerp(camera.y, player.y, 0.1);
    if (screenShake.intensity > 0) {
        screenShake.x = rand(-1, 1) * screenShake.intensity; screenShake.y = rand(-1, 1) * screenShake.intensity;
        screenShake.intensity *= 0.85; if (screenShake.intensity < 0.5) screenShake.intensity = 0;
    } else { screenShake.x = 0; screenShake.y = 0; }
}

function gameOver() {
    state = 'gameover';
    sfx.gameover();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('final-score').textContent = player.score;
    document.getElementById('final-kills').textContent = player.kills;
    document.getElementById('final-gems').textContent = player.gems;
    document.getElementById('final-time').textContent = formatTime(gameTime);
    document.getElementById('final-wave').textContent = waveNum;
    resetJoystick(); touchShootDown = false; touchDashDown = false;
}

function formatTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function showLevelUp(text) {
    const el = document.getElementById('levelup-notification');
    document.getElementById('levelup-text').textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2000);
}

// ======================== DRAWING ========================
function toScreen(wx, wy) {
    return { x: wx - camera.x + W / 2 + screenShake.x, y: wy - camera.y + H / 2 + screenShake.y };
}

function drawBackground() {
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
    const gridSize = 80;
    const ox = (-camera.x % gridSize + gridSize) % gridSize + screenShake.x;
    const oy = (-camera.y % gridSize + gridSize) % gridSize + screenShake.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let x = ox; x < W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const tl = toScreen(0, 0), br = toScreen(WORLD_SIZE, WORLD_SIZE);
    ctx.strokeStyle = 'rgba(255,0,100,0.3)'; ctx.lineWidth = 3;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 60; i++) {
        const dx = ((42 * (i + 1) * 7919) % WORLD_SIZE), dy = ((42 * (i + 1) * 6271) % WORLD_SIZE);
        const p = toScreen(dx, dy);
        if (p.x > -10 && p.x < W + 10 && p.y > -10 && p.y < H + 10) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }
}

function drawPlayer() {
    const p = toScreen(player.x, player.y);
    if (player.invulnTimer > 0 && Math.sin(player.invulnTimer * 20) > 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(player.angle);
    if (player.shield > 0) {
        ctx.strokeStyle = 'rgba(0,170,255,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,170,255,0.15)'; ctx.lineWidth = 6; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,255,255,0.3)'; ctx.beginPath();
    ctx.moveTo(-12, -8); ctx.lineTo(-22 - rand(0, 6), 0); ctx.lineTo(-12, 8); ctx.fill();
    const grd = ctx.createLinearGradient(-14, 0, 18, 0);
    grd.addColorStop(0, '#006688'); grd.addColorStop(1, '#00ffff');
    ctx.fillStyle = grd; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, -11); ctx.lineTo(-8, 0); ctx.lineTo(-12, 11);
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaffff'; ctx.beginPath(); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.fill();
    // Draw weapon indicator on ship
    const w = WEAPONS[currentWeaponIdx];
    ctx.fillStyle = w.color; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(14, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawEnemies() {
    for (const e of enemies) {
        const p = toScreen(e.x, e.y);
        if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) continue;
        const def = ENEMY_TYPES[e.type];
        const color = e.flashTimer > 0 ? '#ffffff' : def.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.shadowColor = color; ctx.shadowBlur = 12;
        if (e.type === 'chaser') {
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, e.size * 0.45, 0, Math.PI * 2); ctx.fill();
            const ea = angle(e, player);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(ea) * 5, Math.sin(ea) * 5, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(Math.cos(ea) * 6, Math.sin(ea) * 6, 1.5, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === 'dasher') {
            ctx.fillStyle = color; ctx.rotate(Math.PI / 4);
            ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-e.size * 0.5, -e.size * 0.5, e.size, e.size);
        } else if (e.type === 'tank') {
            ctx.fillStyle = color; drawHex(ctx, 0, 0, e.size); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; drawHex(ctx, 0, 0, e.size * 0.55); ctx.fill();
            if (e.hp < e.maxHp) {
                ctx.shadowBlur = 0; const bw = e.size * 2;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw / 2, -e.size - 10, bw, 4);
                ctx.fillStyle = color; ctx.fillRect(-bw / 2, -e.size - 10, bw * (e.hp / e.maxHp), 4);
            }
        } else if (e.type === 'splitter') {
            ctx.fillStyle = color; ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-e.size, 0); ctx.lineTo(e.size, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -e.size); ctx.lineTo(0, e.size); ctx.stroke();
        }
        ctx.restore();
    }
}

function drawHex(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        i === 0 ? c.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)) : c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    c.closePath();
}

function drawBullets() {
    for (const b of bullets) {
        const p = toScreen(b.x, b.y);
        if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
        ctx.shadowColor = b.color; ctx.shadowBlur = 10;

        if (b.weaponId === 'laser') {
            // Laser: long thin line
            ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
            const len = 18;
            const nx = b.vx / Math.hypot(b.vx, b.vy), ny = b.vy / Math.hypot(b.vx, b.vy);
            ctx.beginPath(); ctx.moveTo(p.x - nx * len, p.y - ny * len); ctx.lineTo(p.x + nx * 4, p.y + ny * 4); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x - nx * len, p.y - ny * len); ctx.lineTo(p.x + nx * 4, p.y + ny * 4); ctx.stroke();
            ctx.globalAlpha = 1;
        } else if (b.weaponId === 'rocket') {
            // Rocket: larger with trail
            ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p.x, p.y, b.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(p.x, p.y, b.size * 0.5, 0, Math.PI * 2); ctx.fill();
            // Trail
            ctx.fillStyle = 'rgba(255,100,0,0.3)';
            for (let t = 1; t <= 3; t++) {
                ctx.beginPath();
                ctx.arc(p.x - b.vx * 0.005 * t + rand(-3, 3), p.y - b.vy * 0.005 * t + rand(-3, 3), b.size * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (b.weaponId === 'shotgun') {
            ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p.x, p.y, b.size, 0, Math.PI * 2); ctx.fill();
        } else {
            // Default bullet
            ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p.x, p.y, b.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath(); ctx.arc(p.x - b.vx * 0.008, p.y - b.vy * 0.008, b.size + 2, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.shadowBlur = 0;
}

function drawGems() {
    for (const g of gems) {
        const p = toScreen(g.x, g.y);
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
        const bob = Math.sin(g.bobPhase) * 3, color = GEM_COLORS[g.type], fade = g.life < 5 ? g.life / 5 : 1;
        ctx.save(); ctx.translate(p.x, p.y + bob); ctx.globalAlpha = fade;
        ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        if (g.sparkle > 0.5) {
            g.sparkle = 0; ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath(); ctx.arc(rand(-4, 4), rand(-4, 4), 1.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

function drawParticles() {
    for (const p of particles) {
        const s = toScreen(p.x, p.y); const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const d of damageNumbers) {
        const s = toScreen(d.x, d.y); ctx.globalAlpha = d.life / d.maxLife;
        ctx.fillStyle = d.color; ctx.font = 'bold 16px Orbitron'; ctx.textAlign = 'center';
        ctx.fillText(d.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
}

function drawMinimap() {
    const mmSize = 140, mmPad = 20;
    const mmX = W - mmSize - mmPad, mmY = H - mmSize - mmPad, scale = mmSize / WORLD_SIZE;
    ctx.fillStyle = 'rgba(5,5,20,0.7)'; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.fillRect(mmX, mmY, mmSize, mmSize); ctx.strokeRect(mmX, mmY, mmSize, mmSize);
    ctx.fillStyle = 'rgba(255,68,80,0.7)';
    for (const e of enemies) ctx.fillRect(mmX + e.x * scale - 1, mmY + e.y * scale - 1, 2, 2);
    ctx.fillStyle = 'rgba(255,255,100,0.6)';
    for (const g of gems) ctx.fillRect(mmX + g.x * scale, mmY + g.y * scale, 1.5, 1.5);
    ctx.fillStyle = '#00ffff'; ctx.beginPath();
    ctx.arc(mmX + player.x * scale, mmY + player.y * scale, 3, 0, Math.PI * 2); ctx.fill();
    const vx = mmX + (camera.x - W / 2) * scale, vy = mmY + (camera.y - H / 2) * scale;
    ctx.strokeStyle = 'rgba(0,255,255,0.3)'; ctx.strokeRect(vx, vy, W * scale, H * scale);
}

function drawCrosshair() {
    if (controlMode === 'touch') return;
    const w = WEAPONS[currentWeaponIdx];
    ctx.strokeStyle = w.color + '88'; ctx.lineWidth = 1.5;
    const cx = mouse.x, cy = mouse.y, s = 12, g = 5;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy); ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy); ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + s);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = w.color + 'bb'; ctx.fill();
}

function drawWeaponBar() {
    const barW = WEAPONS.length * 56 + 10;
    const barX = (W - barW) / 2, barY = H - 65;
    ctx.fillStyle = 'rgba(5,5,20,0.7)';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    // Background
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(barX + r, barY); ctx.lineTo(barX + barW - r, barY);
    ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
    ctx.lineTo(barX + barW, barY + 42 - r);
    ctx.quadraticCurveTo(barX + barW, barY + 42, barX + barW - r, barY + 42);
    ctx.lineTo(barX + r, barY + 42);
    ctx.quadraticCurveTo(barX, barY + 42, barX, barY + 42 - r);
    ctx.lineTo(barX, barY + r);
    ctx.quadraticCurveTo(barX, barY, barX + r, barY);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    for (let i = 0; i < WEAPONS.length; i++) {
        const w = WEAPONS[i];
        const sx = barX + 8 + i * 56, sy = barY + 4, sw = 48, sh = 34;
        const active = i === currentWeaponIdx;
        // Slot bg
        ctx.fillStyle = active ? w.color + '33' : 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = active ? w.color : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = active ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 6);
        ctx.fill(); ctx.stroke();
        // Icon
        ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(w.icon, sx + sw / 2, sy + 13);
        // Key number
        ctx.font = 'bold 9px Orbitron'; ctx.fillStyle = active ? w.color : 'rgba(255,255,255,0.35)';
        ctx.fillText(w.key, sx + sw / 2, sy + 28);
    }
}

// ======================== HUD ========================
function updateHUD() {
    document.getElementById('score-value').textContent = player.score;
    document.getElementById('gems-value').textContent = player.gems;
    document.getElementById('wave-value').textContent = waveNum;
    document.getElementById('kills-value').textContent = player.kills;
    document.getElementById('time-value').textContent = formatTime(gameTime);

    const livesEl = document.getElementById('lives-icons');
    livesEl.innerHTML = '';
    for (let i = 0; i < PLAYER_LIVES; i++) {
        const icon = document.createElement('div');
        icon.className = 'life-icon' + (i >= player.lives ? ' lost' : '');
        livesEl.appendChild(icon);
    }
    const hpPct = (player.hp / player.maxHp) * 100;
    const hpBar = document.getElementById('health-bar');
    hpBar.style.width = hpPct + '%';
    hpBar.className = hpPct < 30 ? 'low' : '';
    document.getElementById('health-text').textContent = Math.ceil(player.hp) + '/' + player.maxHp;

    const puEl = document.getElementById('powerup-display');
    puEl.innerHTML = '';
    for (const pu of activePowerups) {
        const div = document.createElement('div');
        div.className = 'powerup-indicator'; div.style.borderColor = pu.color;
        div.innerHTML = `<span class="pu-icon">${pu.icon}</span>${pu.name}<span class="pu-timer">${Math.ceil(pu.timer)}s</span>`;
        puEl.appendChild(div);
    }
}

// ======================== MAIN LOOP ========================
let lastTime = 0;
function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (state === 'playing') {
        gameTime += dt;
        updatePlayer(dt); updateBullets(dt); updateEnemies(dt);
        updateGems(dt); updatePowerups(dt); updateParticles(dt);
        updateSpawner(dt); updateCamera();
    }

    drawBackground();
    if (state === 'playing' || state === 'gameover') {
        drawGems(); drawBullets(); drawEnemies(); drawPlayer();
        drawParticles(); drawMinimap(); drawCrosshair(); drawWeaponBar();
    }
    if (state === 'playing') updateHUD();
    if (state === 'menu') drawMenuDecor();
}

function drawMenuDecor() {
    const t = Date.now() / 1000;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 30; i++) {
        const x = W / 2 + Math.cos(t * 0.3 + i * 0.7) * (200 + i * 8);
        const y = H / 2 + Math.sin(t * 0.4 + i * 0.5) * (150 + i * 6);
        ctx.fillStyle = GEM_COLORS[i % 4];
        ctx.beginPath(); ctx.arc(x, y, 3 + Math.sin(t + i) * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

requestAnimationFrame(gameLoop);
