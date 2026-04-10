import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
import { z } from 'zod'

export const getCurrentTime = tool(
  async ({ timezone }) => {
    // WHY: interrupt() pauses the graph so the user can approve/reject the tool call.
    // The resume value from Command({ resume }) is returned here.
    const approval = interrupt({
      tool: 'get_current_time',
      description: `Get the current date and time in ${timezone}`,
      args: { timezone },
    })

    if (approval?.action === 'reject') {
      return `Tool call rejected by user. Reason: ${approval.reason || 'No reason provided.'}`
    }

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: timezone,
    }).format(new Date())
  },
  {
    name: 'get_current_time',
    description:
      'Get the current date and time in a given IANA timezone, such as Europe/Paris or America/New_York.',
    schema: z.object({
      timezone: z.string().describe('IANA timezone string'),
    }),
  },
)
