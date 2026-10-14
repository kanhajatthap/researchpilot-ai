import { getConversation, createConversation, updateConversation, getConversationIdFromRequest } from '@/lib/rag/conversation-store';
import { buildContextPrompt, validateMessages } from '@/lib/rag/chat-utils';
import type { Message, Conversation } from '@/types/chat';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Redirect the server-side conversation store to a throwaway directory so this
// suite never reads from or writes to the real `data/conversations` store.
let testStoreDir: string;

beforeAll(() => {
  testStoreDir = mkdtempSync(join(tmpdir(), 'rp-conversation-memory-'));
  process.env.CONVERSATION_STORE_PATH = testStoreDir;
});

afterAll(() => {
  if (testStoreDir) rmSync(testStoreDir, { recursive: true, force: true });
});

describe('Conversation Memory System', () => {

  it('should create a new conversation with initial messages', async () => {
    const title = 'Test Conversation';
    const initialMessages: Message[] = [
      { id: 'msg-1', role: 'user', content: 'Hello, what is the capital of France?', createdAt: new Date() },
      { id: 'msg-2', role: 'assistant', content: 'The capital of France is Paris.', createdAt: new Date() }
    ];
    
    const conversationId = await createConversation(title, initialMessages);
    expect(conversationId).toBeDefined();
    expect(typeof conversationId).toBe('string');
  });

  it('should retrieve an existing conversation', async () => {
    const title = 'Retrieve Test';
    const initialMessages: Message[] = [
      { id: 'msg-1', role: 'user', content: 'Test message', createdAt: new Date() }
    ];
    
    const conversationId = await createConversation(title, initialMessages);
    const retrievedConversation = await getConversation(conversationId);
    
    expect(retrievedConversation).toBeTruthy();
    expect(retrievedConversation.id).toBe(conversationId);
    expect(retrievedConversation.messages.length).toBe(1);
    expect(retrievedConversation.messages[0].content).toBe('Test message');
  });

  it('should return null for non-existent conversation', async () => {
    const nonExistentId = 'non-existent-id';
    const retrievedConversation = await getConversation(nonExistentId);
    expect(retrievedConversation).toBeNull();
  });

  it('should update conversation with new messages', async () => {
    const title = 'Update Test';
    const initialMessages: Message[] = [
      { id: 'msg-1', role: 'user', content: 'First message', createdAt: new Date() }
    ];
    
    const conversationId = await createConversation(title, initialMessages);
    
    const newMessages: Message[] = [
      { id: 'msg-1', role: 'user', content: 'First message', createdAt: new Date() },
      { id: 'msg-2', role: 'assistant', content: 'First response', createdAt: new Date() },
      { id: 'msg-3', role: 'user', content: 'Second message', createdAt: new Date() }
    ];
    
    await updateConversation(conversationId, newMessages);
    const updatedConversation = await getConversation(conversationId);
    
    expect(updatedConversation.messages.length).toBe(3);
    expect(updatedConversation.messages[2].content).toBe('Second message');
  });

  it('should get conversation ID from request with existing ID', async () => {
    const existingId = 'existing-conversation-id';
    const requestWithId = { conversationId: existingId };
    
    const retrievedId = await getConversationIdFromRequest(requestWithId);
    expect(retrievedId).toBe(existingId);
  });

  it('should create new conversation when ID is not provided', async () => {
    const requestWithoutId = { messages: [] };
    
    const newId = await getConversationIdFromRequest(requestWithoutId);
    expect(newId).toBeDefined();
    expect(typeof newId).toBe('string');
    
    // Verify the conversation was actually created
    const createdConversation = await getConversation(newId);
    expect(createdConversation).toBeTruthy();
  });

  describe('Context Prompt Building', () => {
    it('should build context prompt for follow-up questions', () => {
      const conversation: Conversation = {
        id: 'test-context',
        title: 'Context Test',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello, what is the capital of France?', createdAt: new Date() },
          { id: 'msg-2', role: 'assistant', content: 'The capital of France is Paris.', createdAt: new Date() }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const followUpQuestion = 'What about Rome?';
      const contextPrompt = buildContextPrompt(conversation, followUpQuestion);
      
      expect(contextPrompt).toContain('Conversation context:');
      expect(contextPrompt).toContain('User: Hello, what is the capital of France?');
      expect(contextPrompt).toContain('Assistant (context only):');
      expect(contextPrompt).toContain('Current question: What about Rome?');
      expect(contextPrompt).toContain('that company');
      expect(contextPrompt).toContain('the previous report');
    });

    it('should limit context to recent messages', () => {
      const conversation: Conversation = {
        id: 'test-context',
        title: 'Context Test',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Message 1', createdAt: new Date() },
          { id: 'msg-2', role: 'assistant', content: 'Response 1', createdAt: new Date() },
          { id: 'msg-3', role: 'user', content: 'Message 2', createdAt: new Date() },
          { id: 'msg-4', role: 'assistant', content: 'Response 2', createdAt: new Date() },
          { id: 'msg-5', role: 'user', content: 'Message 3', createdAt: new Date() },
          { id: 'msg-6', role: 'assistant', content: 'Response 3', createdAt: new Date() },
          { id: 'msg-7', role: 'user', content: 'Message 4', createdAt: new Date() },
          { id: 'msg-8', role: 'assistant', content: 'Response 4', createdAt: new Date() },
          { id: 'msg-9', role: 'user', content: 'Message 5', createdAt: new Date() },
          { id: 'msg-10', role: 'assistant', content: 'Response 5', createdAt: new Date() },
          { id: 'msg-11', role: 'user', content: 'Message 6', createdAt: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const contextPrompt = buildContextPrompt(conversation, 'Follow-up question');
      
      // Should contain recent messages but not all messages
      expect(contextPrompt).toContain('Message 6');
      // CONTEXT_WINDOW_MESSAGES = 10, so the oldest message is intentionally dropped.
      expect(contextPrompt).not.toContain('Message 1');
      // The prompt should limit to recent messages
    });

    it('should handle conversations without previous messages', () => {
      const conversation: Conversation = {
        id: 'empty-context',
        title: 'Empty Context',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const followUpQuestion = 'What is the capital of France?';
      const contextPrompt = buildContextPrompt(conversation, followUpQuestion);
      
      expect(contextPrompt).toContain('Conversation context:');
      expect(contextPrompt).toContain('Current question: What is the capital of France?');
    });
  });

  describe('Message Validation', () => {
    it('should validate valid messages', () => {
      const validMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ];
      
      const validated = validateMessages(validMessages);
      expect(validated).toHaveLength(2);
      expect(validated[0].role).toBe('user');
      expect(validated[1].role).toBe('assistant');
    });

    it('should reject empty message array', () => {
      expect(() => validateMessages([])).toThrow('No messages provided');
    });

    it('should reject too many messages', () => {
      const manyMessages = Array.from({ length: 51 }, (_, i) => ({ role: 'user', content: `Message ${i}` }));
      expect(() => validateMessages(manyMessages)).toThrow('Too many messages');
    });
  });
});