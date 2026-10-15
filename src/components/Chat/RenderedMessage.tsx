'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Unescape markdown sequences that the model sometimes outputs with backslashes
 * Common patterns:
 * - \*\* → **
 * - \_ → _
 * - \### → ###
 * - \| → |
 * - \--- → ---
 * - \` → `
 * - \[ → [
 * - \] → ]
 * - \n → newline (preserve)
 * - \r → carriage return (preserve)
 */
function unescapeMarkdown(text: string): string {
  // Replace escaped newlines and carriage returns first with placeholders
  let processed = text
    .replace(/\\n/g, '\u000A')
    .replace(/\\r/g, '\u000D');

  // Remove backslash before markdown symbols
  processed = processed
    // Handle backtick (code)
    .replace(/\\`/g, '`')
    // Handle brackets
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    // Handle parentheses
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    // Handle underscore
    .replace(/\\_/g, '_')
    // Handle asterisks (bold/italic)
    .replace(/\\\*/g, '*')
    // Handle hash (headers) - at start of line
    .replace(/^\\#/gm, '#')
    .replace(/\n\\#/g, '\n#')
    // Handle pipe (table separators)
    .replace(/\\\|/g, '|')
    // Handle horizontal rule dashes (---)
    .replace(/\\-/g, '-');

  // Restore newlines and carriage returns
  processed = processed
    .replace(/\u000A/g, '\n')
    .replace(/\u000D/g, '\r');

  return processed;
}

interface RenderedMessageProps {
  content: string;
  className?: string;
}

/**
 * RenderedMessage - Professional markdown rendering for AI responses
 * Supports: headings, bold/italic, lists, tables, code blocks, inline code,
 * blockquotes, links, horizontal rules
 */
export function RenderedMessage({ content, className }: RenderedMessageProps) {
  const processedContent = unescapeMarkdown(content);

  return (
    <div
      className={className}
      data-testid='rendered-message'
    >
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}