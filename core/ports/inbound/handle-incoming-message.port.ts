import type { IncomingMessage } from '@/core/domain/conversation'

export type HandleIncomingMessageOutcome = 'ok' | 'rate_limited'

export interface HandleIncomingMessageUseCase {
  execute(message: IncomingMessage): Promise<HandleIncomingMessageOutcome>
}
