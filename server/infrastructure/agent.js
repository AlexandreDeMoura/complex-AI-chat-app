import { MemorySaver } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatMistralAI } from '@langchain/mistralai'
import { createAgent } from 'langchain'
import { getCurrentTime } from '../domain/tools.js'

const DEFAULT_TEMPERATURE = 0.65
const SHARED_CHECKPOINTER = new MemorySaver()
const THINKING_EFFORTS = ['off', 'low', 'medium', 'high', 'max']

const AVAILABLE_MODELS = [
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', envKey: 'OPENAI_API_KEY', supportsThinking: false },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', envKey: 'OPENAI_API_KEY', supportsThinking: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY', supportsThinking: true },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', envKey: 'ANTHROPIC_API_KEY', supportsThinking: true },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', envKey: 'MISTRAL_API_KEY', supportsThinking: true },
  { id: 'mistral-medium-2508', name: 'Mistral Medium', provider: 'mistral', envKey: 'MISTRAL_API_KEY', supportsThinking: true },
  { id: 'magistral-medium-2509', name: 'Magistral Medium', provider: 'mistral', envKey: 'MISTRAL_API_KEY', supportsThinking: true },
]

export function getAvailableModels() {
  return AVAILABLE_MODELS
    .filter((m) => process.env[m.envKey])
    .map(({ id, name, provider, supportsThinking }) => ({ id, name, provider, supportsThinking }))
}

const normalizeThinkingEffort = (effort) => {
  if (THINKING_EFFORTS.includes(effort)) {
    return effort
  }
  return 'off'
}

const resolveOpenAIReasoningEffort = (effort) => {
  if (effort === 'max') return 'xhigh'
  if (effort === 'high') return 'high'
  if (effort === 'medium') return 'medium'
  if (effort === 'low') return 'low'
  return undefined
}

const resolveMistralReasoningEffort = (effort) => {
  if (effort === 'medium' || effort === 'high' || effort === 'max') {
    return 'high'
  }
  return 'none'
}

const resolveAnthropicConfig = (modelId, effort) => {
  if (effort === 'off') {
    return new ChatAnthropic({
      model: modelId,
      temperature: DEFAULT_TEMPERATURE,
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  return new ChatAnthropic({
    model: modelId,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}

const resolveOpenAIConfig = (modelId, effort) => {
  if (effort === 'off') {
    return new ChatOpenAI({
      model: modelId,
      temperature: DEFAULT_TEMPERATURE,
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  return new ChatOpenAI({
    model: modelId,
    reasoning_effort: resolveOpenAIReasoningEffort(effort),
    apiKey: process.env.OPENAI_API_KEY,
  })
}

const resolveMistralConfig = (modelId, effort) => {
  if (effort === 'off') {
    return new ChatMistralAI({
      model: modelId,
      temperature: DEFAULT_TEMPERATURE,
      apiKey: process.env.MISTRAL_API_KEY,
    })
  }

  return new ChatMistralAI({
    model: modelId,
    temperature: DEFAULT_TEMPERATURE,
    model_kwargs: { reasoning_effort: resolveMistralReasoningEffort(effort) },
    apiKey: process.env.MISTRAL_API_KEY,
  })
}

function resolveModel(model, effort) {
  if (model.provider === 'anthropic') return resolveAnthropicConfig(model.id, effort)
  if (model.provider === 'mistral') return resolveMistralConfig(model.id, effort)
  return resolveOpenAIConfig(model.id, effort)
}

const agentCache = new Map()

export function getAgent(modelId, thinkingEffort) {
  const available = getAvailableModels()
  const resolved = available.find((m) => m.id === modelId)
  if (!resolved) {
    throw new Error(`Model "${modelId}" is not available. Check that the provider API key is set.`)
  }

  const requestedEffort = normalizeThinkingEffort(thinkingEffort)
  const effectiveEffort = resolved.supportsThinking ? requestedEffort : 'off'
  const cacheKey = `${modelId}:${effectiveEffort}`

  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey)
  }

  const agent = createAgent({
    model: resolveModel(resolved, effectiveEffort),
    tools: [getCurrentTime],
    checkpointer: SHARED_CHECKPOINTER,
    systemPrompt:
      'You are the assistant of a senior software engineer that will mainly want to discuss, debate and explore with you about system design, architecture patterns and other software engineering topics. Be consise without sacrificing clarity and shallowness in your explanations. Your explanation about a topic should be enough for the user to make an informed technical decision on important software engineering topics. No emojis.',
  })

  agentCache.set(cacheKey, agent)
  return agent
}
