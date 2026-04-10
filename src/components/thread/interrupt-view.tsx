import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { InterruptState } from '@/features/chat/model'

interface InterruptViewProps {
  interrupt: InterruptState
  onApprove: () => void
  onReject: (reason: string) => void
  isLoading: boolean
}

export function InterruptView({
  interrupt,
  onApprove,
  onReject,
  isLoading,
}: InterruptViewProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  return (
    <div className="mr-auto w-full">
      <div className="border-border bg-muted/30 rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">
          The agent wants to use {interrupt.toolCalls.length === 1 ? 'a tool' : `${interrupt.toolCalls.length} tools`}:
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {interrupt.toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="border-border rounded-lg border bg-background p-3"
            >
              <p className="text-sm font-semibold">{tc.name}</p>
              <pre className="mt-1.5 overflow-x-auto rounded bg-black p-2 text-xs text-white">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        {showRejectInput && (
          <div className="mb-3">
            <textarea
              className="bg-background border-border w-full rounded-lg border p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Reason for rejection (optional)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onApprove}
            disabled={isLoading}
          >
            <CheckCircle2 className="size-3.5" />
            Approve
          </Button>

          {showRejectInput ? (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => {
                onReject(rejectReason)
                setShowRejectInput(false)
                setRejectReason('')
              }}
              disabled={isLoading}
            >
              <XCircle className="size-3.5" />
              Confirm Reject
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setShowRejectInput(true)}
              disabled={isLoading}
            >
              <XCircle className="size-3.5" />
              Reject
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
