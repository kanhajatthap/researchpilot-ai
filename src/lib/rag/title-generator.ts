/**
 * Generate a short title from the first user message.
 * Deterministic and local - no LLM required.
 * 
 * @param content - The message content to extract a title from
 * @returns A short, clean title for the conversation
 */
export function generateTitleFromMessage(content: string): string {
  const DEFAULT_TITLE = 'Untitled Research Conversation';
  
  if (!content || typeof content !== 'string') {
    return DEFAULT_TITLE;
  }
  
  // Remove control characters and excessive whitespace
  const cleanContent = content.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (!cleanContent) {
    return DEFAULT_TITLE;
  }
  
  // Split into words and take a reasonable prefix
  const words = cleanContent.split(' ');
  
  // If very short, use the whole thing
  if (cleanContent.length <= 40) {
    return cleanContent;
  }
  
  // Otherwise, build a title from up to 6 words
  const maxWords = 6;
  const titleWords: string[] = [];
  let titleLength = 0;
  
  for (const word of words) {
    if (titleWords.length >= maxWords) break;
    if (titleLength + word.length + 1 > 40) break;
    titleWords.push(word);
    titleLength += word.length + 1;
  }
  
  if (titleWords.length === 0) {
    return DEFAULT_TITLE;
  }
  
  // Remove trailing non-alphanumeric characters
  const title = titleWords.join(' ').replace(/[^\w\s]+$/, '').trim();
  
  return title || DEFAULT_TITLE;
}