import { MemorySaver } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatMistralAI } from '@langchain/mistralai'
import { createAgent } from 'langchain'
import { getCurrentTime } from '../domain/tools.js'

const llmModel = process.env.LLM_MODEL ?? 'gpt-4.1-mini'

// WHY: provider is inferred from the model name so callers only set LLM_MODEL.
function resolveModel(name) {
  if (name.startsWith('claude-'))
    return new ChatAnthropic({ model: name, temperature: 0.65, apiKey: process.env.ANTHROPIC_API_KEY })
  if (name.startsWith('mistral-') || name.startsWith('codestral-') || name.startsWith('open-'))
    return new ChatMistralAI({ model: name, temperature: 0.65, apiKey: process.env.MISTRAL_API_KEY })
  return new ChatOpenAI({ model: name, temperature: 0.65, apiKey: process.env.OPENAI_API_KEY })
}

const model = resolveModel(llmModel)

export const agent = createAgent({
  model,
  tools: [getCurrentTime],
  checkpointer: new MemorySaver(),
  systemPrompt:
    'You are a concise, warm assistant for a stylish chat app. Be direct, accurate, and practical.',
})
