# VibeCatan

A browser-based, Catan-style hex board game. Place settlements and roads, roll for resources, and build your way to 10 victory points.

## Run the game

```bash
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`).

## How to play

1. **Setup (2 players)**  
   Take turns placing 2 settlements and 2 roads each. Place a settlement, then a road connected to it. Settlements must be at least 2 edges apart. On your second settlement, you receive one of each resource from the 3 surrounding hexes.

2. **Playing**  
   On your turn:
   - **Roll** the dice. Each player with a settlement or city on a hex with that number gets resources (1 per settlement, 2 per city). 7 is the robber (ignored in this version).
   - **Build** (optional): Road (1 wood, 1 brick), Settlement (1 wood, 1 brick, 1 sheep, 1 wheat), or City (2 wheat, 3 ore) on a settlement.
   - **End turn** when done.

3. **Winning**  
   First to **10 victory points** wins. Settlements = 1 VP, Cities = 2 VP.

## Tech

- **Vite** + **React** + **TypeScript**
- Hex board with terrain (wood, brick, sheep, wheat, ore, desert) and number tokens
- Setup phase, dice, resource handouts, and build/placement rules

## Possible next steps

- Robber: move to a hex and steal from a player there when 7 is rolled
- Trading (player and/or port)
- Development cards
- 3–4 player support and longer roads
