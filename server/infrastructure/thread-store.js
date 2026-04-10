const threads = new Map()

const toThreadRecord = (threadId, message, now) => ({
  thread_id: threadId,
  created_at: now,
  updated_at: now,
  first_message_preview: message.slice(0, 100),
})

export const threadStore = {
  upsert(threadId, message) {
    const now = new Date().toISOString()
    const existing = threads.get(threadId)

    if (!existing) {
      const record = toThreadRecord(threadId, message, now)
      threads.set(threadId, record)
      return record
    }

    existing.updated_at = now
    return existing
  },

  get(threadId) {
    return threads.get(threadId)
  },

  list() {
    return Array.from(threads.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  },
}
