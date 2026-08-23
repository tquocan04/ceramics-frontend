/** §11.6 — manual retry of a failed send. */

import { DomainError, ERROR_CODE } from "@/lib/domain/errors"
import { handle } from "@/lib/mock/http"
import { retryNotification } from "@/lib/mock/events"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return handle(() => {
    const notification = retryNotification(id)
    if (!notification) {
      throw new DomainError(ERROR_CODE.NOTIFICATION_SEND_FAILED, 404)
    }
    return notification
  })
}
