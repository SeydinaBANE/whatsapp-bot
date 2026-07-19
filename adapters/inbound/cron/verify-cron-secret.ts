export function isAuthorizedCronRequest(authorizationHeader: string | null, expectedSecret: string): boolean {
  return authorizationHeader === `Bearer ${expectedSecret}`
}
