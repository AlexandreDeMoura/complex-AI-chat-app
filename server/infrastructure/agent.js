import { MemorySaver } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'
import { getCurrentTime } from '../domain/tools.js'

const llmModel = process.env.LLM_MODEL ?? 'gpt-4.1-mini'

// WHY: provider is inferred from the model name so callers only set LLM_MODEL.
const model = llmModel.startsWith('claude-')
  ? new ChatAnthropic({ model: llmModel, temperature: 0.65, apiKey: process.env.ANTHROPIC_API_KEY })
  : new ChatOpenAI({ model: llmModel, temperature: 0.65, apiKey: process.env.OPENAI_API_KEY })

export const agent = createAgent({
  model,
  tools: [getCurrentTime],
  checkpointer: new MemorySaver(),
  systemPrompt:
    'You are a concise, warm assistant for a stylish chat app. Be direct, accurate, and practical.',
})
