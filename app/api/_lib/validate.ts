export function validateMessage(message: string) {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < 3 || trimmedMessage.length > 4000) {
    return false;
  }
  return true;
}
