# Neon Survivors — 2D Roguelike Shooter

A fast-paced top-down roguelike survivor game built with HTML5 Canvas and vanilla JavaScript.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)

## Running the Game Server

### Option 1: Using `npx serve` (recommended)

```bash
cd d:\Temp\roguelike-game
npx -y serve . -l 3000
```

Then open **http://localhost:3000** in your browser.

### Option 2: Using Python (if Node.js is unavailable)

```bash
cd d:\Temp\roguelike-game

# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

Then open **http://localhost:3000** in your browser.

### Option 3: Open directly

Simply double-click `index.html` to open it directly in your browser. No server needed — the game is fully self-contained.

## Controls

| Key | Action |
|---|---|
| **W A S D** | Move |
| **Mouse** | Aim & Shoot |
| **Space** | Dash |
| **1-5** | Select weapon |
| **Q / E** | Cycle weapon |
| **Mouse Scroll** | Cycle weapon |

## Weapons

| # | Weapon | Special |
|---|---|---|
| 1 | 🔫 Pistol | Balanced default |
| 2 | 💥 Shotgun | 6-pellet spread |
| 3 | 🔥 SMG | Ultra-fast spray |
| 4 | ⚡ Laser Rifle | Pierces through enemies |
| 5 | 🚀 Rocket | Explosive area damage |
