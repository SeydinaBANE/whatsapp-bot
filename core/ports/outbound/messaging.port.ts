export interface MessagingPort {
  sendMessage(to: string, text: string): Promise<void>
}
