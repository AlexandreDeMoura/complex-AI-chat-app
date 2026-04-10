import { InterruptView } from '@/components/thread/interrupt-view'
import type { InterruptState } from '@/features/chat/model'

interface ThreadInterruptSectionProps {
  interrupt: InterruptState | null
  isLoading: boolean
  onApprove: () => void
  onReject: (reason: string) => void
}

export function ThreadInterruptSection({
  interrupt,
  isLoading,
  onApprove,
  onReject,
}: ThreadInterruptSectionProps) {
  if (!interrupt) {
    return null
  }

  return (
    <InterruptView
      interrupt={interrupt}
      onApprove={onApprove}
      onReject={onReject}
      isLoading={isLoading}
    />
  )
}
