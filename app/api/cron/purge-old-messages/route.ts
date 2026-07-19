import { requireEnv } from '@/config/env'
import { isAuthorizedCronRequest } from '@/adapters/inbound/cron/verify-cron-secret'
import { supabaseConversationRepository } from '@/adapters/outbound/supabase/supabase-conversation-repository.adapter'

const CRON_SECRET = requireEnv('CRON_SECRET')
const RETENTION_DAYS = Number(process.env.MESSAGE_RETENTION_DAYS ?? '90')

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), CRON_SECRET)) {
    return new Response('unauthorized', { status: 401 })
  }

  const purged = await supabaseConversationRepository.purgeOlderThan(RETENTION_DAYS)

  return Response.json({ purged })
}
