/** §11.6 — manual retry of a failed send. */

import { DomainError, ERROR_CODE } from "@/lib/domain/errors"
import { handle } from "@/lib/mock/http"
import { retryNotification } from "@/lib/mock/events"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(async () => {
    // Must be awaited: delivery is asynchronous now, and an unawaited promise
    // is always truthy — the 404 below would never fire.
    const notification = await retryNotification(id)
    if (!notification) {
      throw new DomainError(ERROR_CODE.NOTIFICATION_SEND_FAILED, 404)
    }
    return notification
  })
}
