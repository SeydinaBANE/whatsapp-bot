export function isAuthorizedWebhookRequest(url: URL, expectedSecret: string): boolean {
  return url.searchParams.get('token') === expectedSecret
}
