# PRD: 4-Player vs AI Trading

## 1. Overview

Extend player-to-AI trading from 2-player only to **2-, 3-, and 4-player** single-player games using a **Broadcast Trading Model**. The human (Player 1) offers a 1:1 trade to *the table* — all AI opponents evaluate the offer simultaneously. If one AI accepts, the trade executes; if multiple accept, the human chooses which AI to trade with; if none accept, the offer is declined.

---

## 2. Current State

### 2.1 Implemented (2-player only)
- **PlayerResources**: Trade button enabled when `onOfferToAI` is set AND human has ≥1 resource. Label: "Trade (with player or bank)".
- **Trade form**: When open, shows "Trade with Player 2 (AI) — 1:1" section with Give 1 / Get 1 selects and "Offer" button.
- **SettlersGamePage**: Passes `onOfferToAI` only when `game.players.length === 2`.
- **handleOfferToAI(give, get)**: Hardcodes `aiPlayerId = 2`, `offeringPlayerId = 1`. Calls `evaluateTradeOffer`, applies swap on accept, appends chat to Log.
- **evaluateTradeOffer(state, aiPlayerId, offeringPlayerId, give, giveAmount, want, wantAmount)**: Already supports any `aiPlayerId` and `offeringPlayerId`. No changes needed.
- **aiPersona**: Set only for 2p (`randomPersona()`); used for trade log flavor.

### 2.2 Gaps for 4-player
- `onOfferToAI` is `undefined` when `players.length > 2` → Trade button disabled for bank-only (needs 4+ resources).
- No broadcast flow: offer goes to one AI only; no multi-accept resolution UI.

---

## 3. Requirements

### 3.1 Functional

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Human can broadcast a 1:1 trade offer to **all** AI opponents during their turn. | P0 |
| F2 | Trade button is enabled when human has ≥1 resource AND at least one AI opponent exists. | P0 |
| F3 | Each AI evaluates offers independently (anti-kingmaking, affordability, needs-based utility). | P0 |
| F4 | If exactly one AI accepts: auto-apply swap and close form. | P0 |
| F5 | If multiple AIs accept: show list with "Trade" button next to each; human chooses which to finalize. | P0 |
| F6 | If all AIs reject: show "No takers" and close. Log rejections (with information-leak filtering). | P0 |
| F7 | Offer button disabled when Give === Get or resources insufficient. | P0 |

### 3.2 Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Reuse existing `evaluateTradeOffer` and `getTradeChatMessage`; no new AI logic. |
| NF2 | **Information leak prevention:** Filter "I don't have enough [Resource]" from Log; use generic "No thanks" so humans cannot infer AI hands. |
| NF3 | Per-AI personas for flavor; show persona names in resolution UI (e.g. "Player 2 (The Merchant)"). |

---

## 4. Design (Broadcast Trading Model)

### 4.1 API Changes

#### 4.1.1 `handleOfferToTable` (Replaces `handleOfferToAI`)
**New Signature:**
```ts
(give: Terrain, get: Terrain) => void
```
We no longer pass a `targetAiPlayerId`. The offer is broadcast to all AI opponents simultaneously.

#### 4.1.2 `onOfferToTable` (Replaces `onOfferToAI`)
**New Signature:**
```ts
onOfferToTable?: (give: Terrain, get: Terrain) => void
```
Passed when `players.length >= 2`, it is the human's turn, and at least one AI exists.

#### 4.1.3 `tableTradeState` (Replaces `aiTradeConsidering`)
**New State Structure:**
```ts
type TableTradeState = 'idle' | 'considering' | 'resolved';

// Additionally, track which AIs accepted to render the final selection UI:
type AcceptedAIs = PlayerId[];
```

### 4.2 PlayerResources Changes

1. **Trade form: Open Market UI**
   - Remove any dropdown or selector for target AI.
   - The UI strictly focuses on the transaction: "Give 1 [Resource] / Get 1 [Resource]".
   - The primary button becomes **"Offer to Table"**.

2. **Offer button logic**
   - Disabled if resources are insufficient or if Give === Get.
   - Clicking sets `tableTradeState = 'considering'` and calls `onOfferToTable(give, get)`.

3. **"Considering" & Resolution state**
   - When `'considering'`, show a loading state: "The table is reviewing your offer..."
   - When `'resolved'`:
     - If `AcceptedAIs.length > 0`, display the avatars of the AIs who accepted with a "Trade" button next to each; show decliners with ❌ and their persona/flavor.
     - If `AcceptedAIs.length === 0`, show a brief "No takers" message and close.

### 4.3 SettlersGamePage Changes

1. **`handleOfferToTable(give, get)` Logic Flow**
   - Validate human has ≥1 of `give` and `give !== get`.
   - Set `tableTradeState = 'considering'`.
   - Filter `game.players` to find all active AI opponents.
   - Use `setTimeout` (800ms – 1500ms) to simulate the AI thinking delay.
   - Run `evaluateTradeOffer` for each AI opponent.
   - **Resolution:**
     - **Multiple accept:** Set `tableTradeState = 'resolved'` and `AcceptedAIs = [accepted player IDs]`. Human clicks "Trade" next to chosen AI; apply swap, append accept message to Log, close form.
     - **Exactly one accept:** Automatically apply the swap, append the accept message to the Log, and close the trade form.
     - **All reject:** Append filtered rejections to the Log (see Information Leak Fix), show generic "Declined" / "No takers" UI state, and close.

2. **The "Information Leak" Fix (Log Filtering)**
   - When mapping through AI rejections to append to `GameLog`, filter out the explicit "I don't have enough [Resource]" rejection (`REJECT_NO_MATCH` code).
   - Replace with a generic "No thanks" string so humans cannot infer the AIs' hidden hands.
   - Only pass through specific flavor text for `REJECT_HOARDING` and `REJECT_KINGMAKING`.

---

## 5. UI Wireframes (Text & Layout)

### 5.1 Trade form — Initial State
```
[ Trade Market ]
Offer resources to the table. Anyone with the cards can accept.

Give 1: [Wood (1) ▼]
Get 1:  [Brick ▼]

[ Offer to Table ]
```

### 5.2 Trade form — Considering State
```
[ Trade Market ]
Give 1 Wood -> Get 1 Brick

⏳ The table is reviewing your offer...
```

### 5.3 Trade form — Multiple Accepts (Resolution State)
*Note: This mimics the standard digital Catan UI where opponent responses are listed with green checks or red Xs.*

```
[ Trade Market ]
Your offer was accepted by multiple players! Choose who to trade with:

[🟢] Player 2 (The Merchant)  [ Trade ]
[❌] Player 3 (The Warlord)   - Declined
[🟢] Player 4 (The Joker)     [ Trade ]

[ Cancel Offer ]
```

*Reference: Digital Catan broadcast trading interfaces show multiple player responses with Accept/Decline indicators.*

---

## 6. Data Flow

1. Human opens Trade panel → sees bank trade section + (when 2–4p with AIs) Trade Market section.
2. Human selects Give 1 / Get 1, clicks "Offer to Table".
3. `onOfferToTable(give, get)` called → `tableTradeState = 'considering'`.
4. UI shows "The table is reviewing your offer..."; Offer button disabled.
5. After 800–1500ms: `evaluateTradeOffer` runs for each AI opponent.
6. **Resolution:** Gather accept/reject per AI. If one accept → auto-apply swap, close. If multiple → show selection UI. If none → "No takers", close.

---

## 7. Edge Cases

| Case | Handling |
|------|----------|
| AI has 0 of requested resource | `evaluateTradeOffer` returns reject; Log shows generic "No thanks" (information leak fix). |
| Human has 8+ VP | AI rejects (anti-kingmaking); flavor text passed to Log. |
| Human selects same Give and Get | Offer button disabled; validation before `onOfferToTable`. |
| Trade form open during AI turn | `onOfferToTable` not passed; Trade Market section hidden. |

---

## 8. Implementation Order

1. **Phase 1: Core**
   - Replace `aiTradeConsidering` with `tableTradeState` (`'idle' | 'considering' | 'resolved'`) and `acceptedAIs: PlayerId[]`.
   - Replace `handleOfferToAI` with `handleOfferToTable(give, get)`.
   - Pass `onOfferToTable` when `players.length >= 2` and at least one AI.
   - Update PlayerResources: "Offer to Table" button, no target selector, considering/resolution UI.
   - Implement broadcast logic: run `evaluateTradeOffer` for each AI; handle 0/1/multiple accept cases.

2. **Phase 2: Polish**
   - Information leak fix: filter `REJECT_NO_MATCH` from Log; use generic "No thanks".
   - Per-AI persona display in resolution UI (e.g. "Player 2 (The Merchant)").

3. **Phase 3 (optional)**
   - Per-AI personas (`aiPersonas`) for flavor variety.

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SettlersGamePage.tsx` | Replace `handleOfferToAI` with `handleOfferToTable(give, get)`; replace `aiTradeConsidering` with `tableTradeState` + `acceptedAIs`; pass `onOfferToTable` when `players.length >= 2` and at least one AI; implement broadcast + resolution logic |
| `src/components/PlayerResources.tsx` | Replace `onOfferToAI` with `onOfferToTable(give, get)`; remove target AI selector; add "Offer to Table" button; add considering ("The table is reviewing...") and resolution (multiple accept selection / "No takers") UI |
| `src/game/ai.ts` | No changes (evaluateTradeOffer already generic) |
| `src/game/tradeLogFlavor.ts` | Add generic "No thanks" for REJECT_NO_MATCH when used in log filtering (or handle in caller) |
| `docs/GAME_FEATURES_AND_LOGIC_FOR_AI.md` | Update Section 7.2 and 12 to reflect broadcast trading (2–4p) |

---

## 10. Acceptance Criteria

- [ ] In 2–4 player single-player, human can open Trade and see "Trade Market" with Give 1 / Get 1 and "Offer to Table".
- [ ] Human with 1+ resource can offer (e.g. 1 Brick for 1 Wood); button disabled when Give === Get.
- [ ] UI shows "The table is reviewing your offer..." for ~1 second.
- [ ] If exactly one AI accepts: resources swap; Log shows accept message; trade form closes.
- [ ] If multiple AIs accept: human sees list with "Trade" button per acceptor; chooses one; swap applies.
- [ ] If all reject: "No takers" UI; Log shows filtered rejections (no "I don't have enough X" — generic "No thanks" only for that code).
- [ ] REJECT_HOARDING and REJECT_KINGMAKING flavors still appear in Log.
