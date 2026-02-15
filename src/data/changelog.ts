/**
 * Changelog / patch notes for SEO and transparency.
 * When you add new entries (new text), update the sitemap lastmod for /changelog.
 *
 * SAFETY RULES (do not break):
 * - Keep wording player-facing only. No internal jargon, variable names, or tech stack (e.g. Vercel, Supabase).
 * - NEVER add security-sensitive details: no auth logic, host/lobby implementation, URL params (e.g. ?host=1),
 *   sessionStorage/localStorage keys, or anything that could help someone exploit the game or backend.
 * - Prefer "Fixed a bug where …" over "Fixed ?host=1 and sessionStorage so …".
 */

export interface ChangelogEntry {
  /** ISO date (YYYY-MM-DD) for sitemap and ordering */
  date: string
  /** Human-readable date for display, e.g. "Feb 7, 2026" */
  dateLabel: string
  /** Plain-text patch note lines (visible to users and crawlers) */
  items: string[]
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-02-15',
    dateLabel: 'Feb 15, 2026',
    items: [
      'Board Zoom & Pan: You can zoom in on the map only (the Resources drawer stays visible). Smooth drag-to-pan in all directions; the map centers when you zoom in.',
      'Sidebar: Instruction messages now appear over the game title so the full map stays visible. Resources section moved above Victory Points.',
      'Multiplayer: Either player can start the game once both have joined. Multiplayer now uses the same parchment look as single-player.',
      'Resources UI: Road, Settlement, and City icons in the build costs now use the active player’s color.',
    ],
  },
  {
    date: '2026-02-07',
    dateLabel: 'Feb 7, 2026',
    items: [
      'Visual Polish: Added subtle hex background, floating card layout, and improved button animations.',
      'Game UI: Moved game title to sidebar for better visibility on small screens.',
      'Roads: New striped road assets with animated placement effects and correct player coloring.',
      'Cities & Settlements: Fixed scale of city icons and added "pulse" animation to valid building spots during setup.',
      'Harbors: Redesigned piers to connect seamlessly with the coast; fixed graphical stretching issues.',
      'Oregon Capitalist: Added Prestige system, Spirit Shop scaling, and end-game buffs.',
    ],
  },
  {
    date: '2026-02-04',
    dateLabel: 'Feb 4, 2026',
    items: [
      'Visuals: Updated Omen card icon to purple pentagram design.',
      'Gameplay: Adjusted unlock requirements for mid/late game in Oregon Capitalist.',
      'Fixes: Resolved issues with Farm Swap omen and harbor ship icons.',
    ],
  },
  {
    date: '2026-02-03',
    dateLabel: 'Feb 3, 2026',
    items: [
      'New Terrain Art: Wheat fields (windmill) and Ore mountains (mine) now match the new art style.',
      'Harbors: New diagonal pier layout and improved water hex integration.',
      'Lobby: Added AI player labels to the color selection screen.',
    ],
  },
  {
    date: '2026-02-02',
    dateLabel: 'Feb 2, 2026',
    items: [
      'New Terrain Art: Brick hexes updated to match the new art style.',
      'Omen Hand Award: Players now receive 2 VP for purchasing 5+ Omen cards.',
      'Stability: Fixed a rare crash during the Omen card draw sequence.',
    ],
  },
  {
    date: '2026-02-01',
    dateLabel: 'Feb 1, 2026',
    items: [
      'Game Flow: Tapping anywhere now instantly completes the dice roll animation (outcome unchanged) for faster gameplay.',
      'Visuals: Complete art overhaul for Wood and Sheep tiles; removed board background for cleaner look.',
      'UI Improvements: Improved readability for game history, resource logs, and trade buttons.',
      'Fixes: Resolved AI turn-flow issues and improved debuff warnings on the parchment theme.',
    ],
  },
  {
    date: '2026-01-31',
    dateLabel: 'Jan 31, 2026',
    items: [
      "Oregon's Omens: Added Omen counter, Robber's Regret mechanics, and UI for build-cost debuffs.",
      'New Content: Added "How to Play" guide and FAQ pages.',
      'Stability: Fixed resource calculation bugs for the "Lost Supplies" omen.',
    ],
  },
  {
    date: '2026-01-30',
    dateLabel: 'Jan 30, 2026',
    items: [
      'Robber: Improved in-game messaging when the Robber is active.',
      'UI: Added resource highlights to build menu for better clarity.',
    ],
  },
  {
    date: '2026-01-29',
    dateLabel: 'Jan 29, 2026',
    items: [
      'Rules Update: Clarified Settlement distance rule (must be 2 road segments away) in the Game Guide.',
      'Multiplayer Fixes: Fixed a critical bug where the second player was incorrectly identified as the Host.',
      'Performance: Optimized initial game load and player indexing.',
    ],
  },
]

/** Latest entry date (ISO) for sitemap lastmod and homepage "Latest: ..." link */
export const LATEST_CHANGELOG_DATE = CHANGELOG_ENTRIES[0]?.date ?? ''
/** Short label for homepage, e.g. "Feb 7" */
export const LATEST_CHANGELOG_LABEL =
  CHANGELOG_ENTRIES[0]?.dateLabel.split(',')[0] ?? ''
