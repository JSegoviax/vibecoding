import type { TradeDecisionCode } from './ai'
import type { Terrain } from './types'

export type AIPersona = 'merchant' | 'aggressor' | 'joker'

const PERSONAS: Record<AIPersona, { name_prefix: string }> = {
  merchant: { name_prefix: '💰 Merchant' },
  aggressor: { name_prefix: '⚔️ Warlord' },
  joker: { name_prefix: '🤡 Jester' },
}

const RESPONSES: Record<TradeDecisionCode, Record<AIPersona, string>> = {
  ACCEPT_TRADE: {
    merchant: 'Deal! Pleasure doing business with you.',
    aggressor: 'Fine. Take it and go.',
    joker: "Finally, a trade that doesn't suck. Deal.",
  },
  REJECT_HOARDING: {
    merchant: 'Sorry friend, I\'m saving that [RESOURCE] for a big project.',
    aggressor: 'No. I need that [RESOURCE]. Back off.',
    joker: "I'd love to, but I'm hoarding [RESOURCE] like a dragon right now.",
  },
  REJECT_KINGMAKING: {
    merchant: "You're winning too hard! I can't help you.",
    aggressor: "I'm not handing you the win. Get lost.",
    joker: 'And let you win? Hah! Nice try.',
  },
  REJECT_NO_MATCH: {
    merchant: "I wish I could, but I don't have what you want.",
    aggressor: "I don't have that.",
    joker: "Go fish. I'm empty.",
  },
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Convert an AI trade decision code + persona into a chat log message.
 * Replaces [RESOURCE] with the given resource name (e.g. "wood" -> "Wood") when present.
 */
export function getTradeChatMessage(
  code: TradeDecisionCode,
  persona: AIPersona,
  resource?: Terrain
): { speaker: string; message: string } {
  const template = RESPONSES[code]?.[persona] ?? RESPONSES.REJECT_NO_MATCH[persona]
  const resourceStr = resource ? cap(resource) : 'it'
  const message = template.replace(/\[RESOURCE\]/g, resourceStr)
  return { speaker: PERSONAS[persona].name_prefix, message }
}

export const PERSONA_OPTIONS: AIPersona[] = ['merchant', 'aggressor', 'joker']

export function randomPersona(): AIPersona {
  return PERSONA_OPTIONS[Math.floor(Math.random() * PERSONA_OPTIONS.length)]
}
