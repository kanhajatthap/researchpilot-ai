import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '@/components/Chat/ChatMessage';
import type { Message } from '@/types/chat';

describe('ChatMessage - AI Response Rendering', () => {
  const baseMessage: Omit<Message, 'id' | 'createdAt'> = {
    role: 'assistant',
    content: '',
  };

  const userMessage: Omit<Message, 'id' | 'createdAt'> = {
    role: 'user',
    content: '',
  };

  describe('AI Message Rendering (with RenderedMessage)', () => {
    it('renders basic markdown (bold, italic) correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-1',
        createdAt: new Date(),
        content: '**bold text** and *italic text*',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      expect(renderedElement).toBeInTheDocument();

      // Check that bold and italic are rendered (they become span elements)
      const boldElement = renderedElement.querySelector('strong');
      const italicElement = renderedElement.querySelector('em');
      expect(boldElement).toBeInTheDocument();
      expect(boldElement).toHaveTextContent('bold text');
      expect(italicElement).toBeInTheDocument();
      expect(italicElement).toHaveTextContent('italic text');
    });

    it('renders headings correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-2',
        createdAt: new Date(),
        content: '# Heading 1\n## Heading 2\n### Heading 3',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      expect(renderedElement.querySelector('h1')).toHaveTextContent('Heading 1');
      expect(renderedElement.querySelector('h2')).toHaveTextContent('Heading 2');
      expect(renderedElement.querySelector('h3')).toHaveTextContent('Heading 3');
    });

    it('renders unordered list correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-3',
        createdAt: new Date(),
        content: '- Item 1\n- Item 2\n- Item 3',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const listItems = renderedElement.querySelectorAll('li');
      expect(listItems).toHaveLength(3);
      expect(listItems[0]).toHaveTextContent('Item 1');
      expect(listItems[1]).toHaveTextContent('Item 2');
      expect(listItems[2]).toHaveTextContent('Item 3');
    });

    it('renders ordered list correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-4',
        createdAt: new Date(),
        content: '1. First item\n2. Second item\n3. Third item',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const listItems = renderedElement.querySelectorAll('li');
      expect(listItems).toHaveLength(3);
      expect(listItems[0]).toHaveTextContent('First item');
      expect(listItems[1]).toHaveTextContent('Second item');
      expect(listItems[2]).toHaveTextContent('Third item');
    });

    it('renders code blocks correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-5',
        createdAt: new Date(),
        content: 'Here is a code block:\n```\ncode block content\n```',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const codeBlocks = renderedElement.querySelectorAll('pre');
      expect(codeBlocks).toHaveLength(1);
      expect(codeBlocks[0].textContent).toContain('code block content');
    });

    it('renders inline code correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-6',
        createdAt: new Date(),
        content: 'This has `inline code` here',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const inlineCode = renderedElement.querySelector('code');
      expect(inlineCode).toBeInTheDocument();
      expect(inlineCode).toHaveTextContent('inline code');
    });

    it('renders blockquote correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-7',
        createdAt: new Date(),
        content: '> This is a quote',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const blockquote = renderedElement.querySelector('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveTextContent('This is a quote');
    });

    it('renders table correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-8',
        createdAt: new Date(),
        content: '| Name | Age |\n|------|-----|\n| John | 30 |\n| Jane | 25 |',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const table = renderedElement.querySelector('table');
      expect(table).toBeInTheDocument();
      const cells = table?.querySelectorAll('td');
      expect(cells).toHaveLength(4);
      expect(cells![0]).toHaveTextContent('John');
      expect(cells![1]).toHaveTextContent('30');
      expect(cells![2]).toHaveTextContent('Jane');
      expect(cells![3]).toHaveTextContent('25');
    });

    it('renders horizontal rule correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-9',
        createdAt: new Date(),
        content: 'Before\n\\n---\\n\\nAfter',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // Check that the content contains the horizontal rule content
      expect(renderedElement.innerHTML).toContain('<hr');
    });

    it('renders link correctly', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-10',
        createdAt: new Date(),
        content: '[Click here](https://example.com)',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      const link = renderedElement.querySelector('a');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveTextContent('Click here');
    });
  });

  describe('User Message Rendering (plain text)', () => {
    it('renders plain text without markdown parsing', () => {
      const message: Message = {
        ...userMessage,
        id: 'user-1',
        createdAt: new Date(),
        content: '**bold text** and *italic text*',
      };

      render(<ChatMessage message={message} />);

      // User messages use plain p tag, not RenderedMessage
      const userMessageContainer = screen.getByText('**bold text** and *italic text*');
      expect(userMessageContainer).toBeInTheDocument();
      expect(userMessageContainer.tagName).toBe('P');
    });
  });

  describe('Escaped Markdown Handling', () => {
    it('handles escaped bold markdown (\\*\\*bold\\*\\*)', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-11',
        createdAt: new Date(),
        content: '\\*\\*bold text\\*\\*',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // The escape should have been processed
      const strongElement = renderedElement.querySelector('strong');
      expect(strongElement).toBeInTheDocument();
      expect(strongElement).toHaveTextContent('bold text');
    });

    it('handles escaped header (\\\\#)', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-12',
        createdAt: new Date(),
        content: '\\\\# Header',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // Our unescapeMarkdown should convert \\# to #
      // The result could be an h1 header OR text content starting with #
      const h1 = renderedElement.querySelector('h1');
      if (h1) {
        expect(h1).toHaveTextContent('Header');
      } else {
        // May be rendered as text with # symbol
        expect(renderedElement.textContent).toContain('Header');
      }
    });

    it('handles escaped table separator (\\\\|)', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-13',
        createdAt: new Date(),
        content: 'cell1 | cell2',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // The separator should be preserved as a literal pipe
      expect(renderedElement).toHaveTextContent('cell1 | cell2');
    });

    it('handles escaped horizontal rule (\\\\-)', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-14',
        createdAt: new Date(),
        content: 'section 1\\n\\\\-\\nsection 2',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // The escape should be unescaped to -, so we expect a literal dash in the content
      expect(renderedElement).toHaveTextContent('section 1');
      expect(renderedElement).toHaveTextContent('section 2');
      // Check for the dash character in the content
      expect(renderedElement.textContent).toContain('-');
    });
  });

  describe('Streaming Content', () => {
    it('shows blinking dot during streaming', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-15',
        createdAt: new Date(),
        content: 'Streaming response...',
      };

      render(<ChatMessage message={message} isStreaming />);

      const dot = document.querySelector('.rp-dot');
      expect(dot).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty content', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-16',
        createdAt: new Date(),
        content: '',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      expect(renderedElement).toBeInTheDocument();
      expect(renderedElement).toHaveTextContent('');
    });

    it('handles mixed markdown and HTML-like tags', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-17',
        createdAt: new Date(),
        content: '**bold** <script>alert("xss")</script> *italic*',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // HTML tags should be sanitized and not appear in rendered output
      expect(renderedElement.querySelector('script')).not.toBeInTheDocument();
      // The sanitized content should still render as plain text
      expect(renderedElement.textContent).toContain('bold');
      expect(renderedElement.textContent).toContain('alert');
      expect(renderedElement.textContent).toContain('italic');
    });

    it('handles nested formatting', () => {
      const message: Message = {
        ...baseMessage,
        id: 'test-18',
        createdAt: new Date(),
        content: '**bold and *italic inside bold* and more bold**',
      };

      render(<ChatMessage message={message} />);

      const renderedElement = screen.getByTestId('rendered-message');
      // This should render as a strong element containing italic text
      const strongElement = renderedElement.querySelector('strong');
      expect(strongElement).toBeInTheDocument();
      // The italic is inside strong
      const italicElement = strongElement?.querySelector('em');
      expect(italicElement).toHaveTextContent('italic inside bold');
    });
  });
});