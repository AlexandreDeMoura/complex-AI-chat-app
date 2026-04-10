import { threadStore } from '../infrastructure/thread-store.js'

export const listThreads = () => threadStore.list()
