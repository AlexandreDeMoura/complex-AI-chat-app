import { MemorySaver } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatMistralAI } from '@langchain/mistralai'
import { createAgent } from 'langchain'
import { getCurrentTime } from '../domain/tools.js'

const AVAILABLE_MODELS = [
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', envKey: 'OPENAI_API_KEY' },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', envKey: 'OPENAI_API_KEY' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', envKey: 'MISTRAL_API_KEY' },
  { id: 'mistral-medium-2508', name: 'Mistral Medium', provider: 'mistral', envKey: 'MISTRAL_API_KEY' },
  { id: 'magistral-medium-2509', name: 'Magistral Medium', provider: 'mistral', envKey: 'MISTRAL_API_KEY' },
]

export function getAvailableModels() {
  return AVAILABLE_MODELS
    .filter((m) => process.env[m.envKey])
    .map(({ id, name, provider }) => ({ id, name, provider }))
}

// WHY: provider is inferred from the model name so callers only set the model id.
function resolveModel(name) {
  if (name.startsWith('claude-'))
    return new ChatAnthropic({ model: name, temperature: 0.65, apiKey: process.env.ANTHROPIC_API_KEY })
  if (name.startsWith('mistral-') || name.startsWith('codestral-') || name.startsWith('open-'))
    return new ChatMistralAI({ model: name, temperature: 0.65, apiKey: process.env.MISTRAL_API_KEY })
  return new ChatOpenAI({ model: name, temperature: 0.65, apiKey: process.env.OPENAI_API_KEY })
}

const agentCache = new Map()

export function getAgent(modelId) {
  const available = getAvailableModels()
  const resolved = available.find((m) => m.id === modelId)
  if (!resolved) {
    throw new Error(`Model "${modelId}" is not available. Check that the provider API key is set.`)
  }

  if (agentCache.has(modelId)) {
    return agentCache.get(modelId)
  }

  const agent = createAgent({
    model: resolveModel(modelId),
    tools: [getCurrentTime],
    checkpointer: new MemorySaver(),
    systemPrompt:
      'You are a concise, warm assistant for a stylish chat app. Be direct, accurate, and practical.',
  })

  agentCache.set(modelId, agent)
  return agent
}
