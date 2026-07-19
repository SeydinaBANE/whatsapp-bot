export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type IncomingMessage = {
  phone: string
  text: string
  messageId: string
}
