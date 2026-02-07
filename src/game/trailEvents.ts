/** Trail Events: Random temporary buffs that keep the game interactive. */

export interface ActiveEvent {
  id: string
  name: string
  description: string
  startTime: number
  duration: number // in ms
  multiplier: number
  effectType: 'click_production' | 'global_production' | 'manager_cost_reduction'
}

export const TRAIL_EVENTS: Omit<ActiveEvent, 'startTime'>[] = [
  {
    id: 'buffalo_migration',
    name: 'Buffalo Migration',
    description: 'Click production ×10',
    duration: 30000, // 30 seconds
    multiplier: 10,
    effectType: 'click_production',
  },
  {
    id: 'gold_rush',
    name: 'Gold Rush',
    description: 'Global production ×5',
    duration: 20000, // 20 seconds
    multiplier: 5,
    effectType: 'global_production',
  },
  {
    id: 'traveling_bard',
    name: 'Traveling Bard',
    description: 'Manager costs -50%',
    duration: 60000, // 60 seconds
    multiplier: 0.5,
    effectType: 'manager_cost_reduction',
  },
]

/** Check if an event should trigger. Probability: 1/3000 per tick (~5 mins at 10 ticks/sec). */
export function checkEventTrigger(): boolean {
  return Math.random() < 1 / 3000
}

/** Get a random trail event. */
export function getRandomEvent(): Omit<ActiveEvent, 'startTime'> {
  const index = Math.floor(Math.random() * TRAIL_EVENTS.length)
  return TRAIL_EVENTS[index]
}

/** Check if an event is still active. */
export function isEventActive(event: ActiveEvent | null, now: number): boolean {
  if (!event) return false
  return now - event.startTime < event.duration
}
