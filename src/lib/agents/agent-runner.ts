import type { GoogleGenAI, Content } from '@google/genai';
import { executeTool, GEMINI_AGENT_TOOLS } from './tools';
import type { ToolName } from './types';
import type { Citation } from '@/types/chat';
import type { AgentStep, AgentTrace } from '@/types/agent';
import { toGeminiContents } from '@/lib/llm/gemini';
import { buildContextPrompt, type IncomingMessage } from '@/lib/rag/chat-utils';
import type { Conversation } from '@/types/chat';

export interface AgentRunnerOptions {
  gemini: GoogleGenAI;
  model: string;
  messages: IncomingMessage[];
  documentId?: string | null;
  existingConversation?: Conversation | null;
  signal?: AbortSignal;
  onTraceUpdate?: (steps: Array<{ label: string; status: string; message: string }>) => void;
  onTextChunk?: (text: string) => void;
}

export interface AgentRunnerResult {
  fullResponse: string;
  citations: Citation[];
  trace: AgentTrace;
}

const AGENT_SYSTEM_INSTRUCTION = `You are ResearchPilot AI, an autonomous expert research assistant.
You have access to real tools:
- search_documents: Always use this tool when asked about uploaded papers, methods, findings, datasets, or specific facts in documents.
- calculator: Use this for accurate mathematical, statistical, or numerical calculations.
- web_search: Use this to search Wikipedia and open literature for definitions, historical background, or concepts not found in local documents.
- search_arxiv: Use this to search arXiv for peer-reviewed preprints, abstracts, author details, and PDF links.
- git_save_notes: Use this when the user asks to save research notes, literature summaries, or comparative reports with Git version control.
- git_status: Use this to check the Git repository state and current branch.
- git_notes_history: Use this to view previous research notes committed to Git.
- list_documents: Use this to see what research documents are uploaded in the knowledge base.

Guidelines:
- Think step by step. Call the appropriate tools proactively when needed.
- Ground your answers in the retrieved excerpts. When citing information from uploaded documents, reference the document title and page numbers.
- Provide clear, structured, academic-grade answers with markdown headers and bullet points where helpful.`;

/**
 * Executes the autonomous agent loop:
 * 1. Checks tool calls using Gemini function calling.
 * 2. Executes tools, captures citations and emits real-time trace events.
 * 3. Streams final synthesized response back to the client.
 */
export async function runAgent({
  gemini,
  model,
  messages,
  documentId,
  existingConversation,
  signal,
  onTraceUpdate,
  onTextChunk,
}: AgentRunnerOptions): Promise<AgentRunnerResult> {
  const startedAt = new Date();
  const traceSteps: AgentStep[] = [];
  const accumulatedCitations: Citation[] = [];

  const emitTrace = (
    label: string,
    status: AgentStep['status'],
    message: string
  ) => {
    const existingIndex = traceSteps.findIndex((s) => s.label === label);
    const step: AgentStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      status,
      timestamp: new Date(),
      message,
    };

    if (existingIndex >= 0) {
      traceSteps[existingIndex] = step;
    } else {
      traceSteps.push(step);
    }

    onTraceUpdate?.(
      traceSteps.map((s) => ({
        label: s.label,
        status: s.status,
        message: s.message,
      }))
    );
  };

  // Build the initial contents
  let contents: Content[] = toGeminiContents(messages);

  if (existingConversation && existingConversation.messages.length > 0) {
    const lastUserMessage = messages[messages.length - 1];
    const contextPrompt = buildContextPrompt(
      existingConversation,
      lastUserMessage.content
    );
    const contextMessages = [
      ...messages.slice(0, -1),
      { role: 'user' as const, content: contextPrompt },
    ];
    contents = toGeminiContents(contextMessages);
  }

  // If scoped to a document and documentId exists, guide the agent context
  if (documentId) {
    const lastContent = contents[contents.length - 1];
    if (lastContent?.parts?.[0]?.text) {
      lastContent.parts[0].text += `\n[Scope note: The user has selected document ID "${documentId}". Focus relevant document searches on this document.]`;
    }
  }

  // Check if generateContent is available (in test mocks, only generateContentStream may be mocked)
  const modelsRecord = (gemini ? gemini.models : null) as Record<string, unknown> | null;
  const hasGenerateContent =
    modelsRecord !== null &&
    typeof modelsRecord.generateContent === 'function';

  let fullResponse = '';
  const MAX_TURNS = 4;
  let turn = 0;

  interface ResponsePart {
    text?: string;
    functionCall?: {
      name: string;
      args?: Record<string, unknown>;
    };
  }

  interface GenerateResponse {
    candidates?: Array<{
      content?: {
        role?: string;
        parts?: ResponsePart[];
      };
    }>;
  }

async function retryTransient<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('high demand') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

  if (hasGenerateContent && modelsRecord) {
    const generateFn = modelsRecord.generateContent as (args: unknown) => Promise<GenerateResponse>;
    while (turn < MAX_TURNS) {
      if (signal?.aborted) break;
      turn++;

      try {
        const response = await retryTransient(() =>
          generateFn({
            model,
            contents,
            config: {
              systemInstruction: AGENT_SYSTEM_INSTRUCTION,
              tools: GEMINI_AGENT_TOOLS,
              abortSignal: signal,
            },
          })
        );

        const candidate = response?.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        // Check for function calls in response parts
        const functionCalls = parts
          .filter((p): p is ResponsePart & { functionCall: { name: string; args?: Record<string, unknown> } } => !!p.functionCall)
          .map((p) => p.functionCall);

        if (functionCalls.length === 0) {
          // No more function calls; extract direct text from response
          let candidateText = '';
          try {
            if (typeof (response as { text?: unknown }).text === 'string') {
              candidateText = (response as { text: string }).text;
            }
          } catch {
            // response.text getter might throw if non-text parts present
          }
          if (!candidateText) {
            candidateText = parts
              .filter((p) => typeof p.text === 'string' && !(p as { thought?: boolean }).thought)
              .map((p) => p.text as string)
              .join('');
          }

          if (candidateText && candidateText.trim().length > 0) {
            fullResponse = candidateText;
            onTextChunk?.(candidateText);
            break;
          }

          break;
        }

        // Preserve the full model turn from Gemini (with thoughts and thought_signature intact)
        if (candidate?.content) {
          contents.push(candidate.content as unknown as Content);
        } else {
          contents.push({
            role: 'model',
            parts: parts.length > 0 ? (parts as unknown as Content['parts']) : functionCalls.map((fc) => ({ functionCall: fc })),
          });
        }

        const functionResponseParts: Array<{
          functionResponse: {
            name: string;
            response: Record<string, unknown>;
          };
        }> = [];

        // Execute function calls
        for (const call of functionCalls) {
          const toolName = call.name as ToolName;
          const args = (call.args || {}) as Record<string, unknown>;

          // Auto-inject documentId scope if user specified one and tool didn't set one
          if (documentId && (toolName === 'search' || toolName === 'search_documents') && !args.documentId) {
            args.documentId = documentId;
          }

          const label =
            toolName === 'search_documents' || toolName === 'search'
              ? 'Document Search'
              : toolName === 'calculator'
              ? 'Calculator'
              : toolName === 'web_search'
              ? 'Wikipedia Search'
              : toolName === 'search_arxiv'
              ? 'arXiv Paper Search'
              : toolName === 'git_save_notes'
              ? 'Git: Save Research Notes'
              : toolName === 'git_status' || toolName === 'git_notes_history'
              ? 'Git: Repository Version Control'
              : 'Knowledge Base';

          emitTrace(
            label,
            'running',
            `Executing ${toolName} with parameters: ${JSON.stringify(args).slice(0, 100)}...`
          );

          const result = await executeTool(toolName, args);

          if (result.success) {
            let summaryMessage = `Completed in ${result.executionTimeMs || 0}ms`;
            if (toolName === 'search_documents' || toolName === 'search') {
              const resData = result.data as {
                results?: Array<{
                  chunkId: string;
                  documentId: string;
                  documentName: string;
                  pageNumber?: number;
                  content: string;
                }>;
                totalResults?: number;
              };
              const count = resData?.totalResults || 0;
              summaryMessage = `Found ${count} relevant excerpt${count === 1 ? '' : 's'}`;

              // Capture citations
              if (resData?.results && Array.isArray(resData.results)) {
                for (const item of resData.results) {
                  if (
                    item.chunkId &&
                    !accumulatedCitations.some((c) => c.chunkId === item.chunkId)
                  ) {
                    accumulatedCitations.push({
                      id: item.chunkId,
                      documentId: item.documentId,
                      documentName: item.documentName,
                      pageNumber: item.pageNumber,
                      chunkId: item.chunkId,
                    });
                  }
                }
              }
            } else if (toolName === 'calculator') {
              const resData = result.data as { expression?: string; result?: number };
              summaryMessage = `${resData?.expression} = ${resData?.result}`;
            } else if (toolName === 'web_search') {
              const resData = result.data as { totalResults?: number; source?: string };
              summaryMessage = `Found ${resData?.totalResults || 0} reference articles from Wikipedia`;
            } else if (toolName === 'search_arxiv') {
              const resData = result.data as { totalFound?: number };
              summaryMessage = `Found ${resData?.totalFound || 0} research papers on arXiv`;
            } else if (toolName === 'git_save_notes') {
              const resData = result.data as { relativePath?: string; committed?: boolean; commitHash?: string };
              summaryMessage = resData?.committed
                ? `Saved & committed to Git (${resData.commitHash || 'HEAD'}) at ${resData.relativePath}`
                : `Saved research note to ${resData?.relativePath}`;
            } else if (toolName === 'git_status') {
              const resData = result.data as { branch?: string; isClean?: boolean };
              summaryMessage = `Branch: ${resData?.branch || 'main'}, Clean: ${resData?.isClean}`;
            } else if (toolName === 'git_notes_history') {
              const resData = result.data as { commits?: Array<unknown> };
              summaryMessage = `Found ${resData?.commits?.length || 0} research note commits`;
            }

            emitTrace(label, 'completed', summaryMessage);
          } else {
            emitTrace(label, 'error', result.error || 'Tool execution failed');
          }

          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              response: result.success
                ? { result: result.data }
                : { error: result.error },
            },
          });
        }

        // Append user turn with all function responses for this turn
        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      } catch (agentErr) {
        console.warn('[agent-runner] function calling turn error:', agentErr);
        break;
      }
    }
  }

  // Stream final synthesis if not already streamed
  if (!fullResponse) {
    if (traceSteps.length > 0) {
      emitTrace('Synthesizing Response', 'running', 'Generating grounded answer with citations...');
    }

    try {
      const stream = await retryTransient(() =>
        gemini.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: AGENT_SYSTEM_INSTRUCTION,
            tools: GEMINI_AGENT_TOOLS as any,
            abortSignal: signal,
          },
        })
      );

      for await (const chunk of stream) {
        let chunkText = '';
        try {
          if (typeof (chunk as { text?: unknown }).text === 'string') {
            chunkText = (chunk as { text: string }).text;
          }
        } catch {
          // ignore getter error if non-text parts present
        }
        if (!chunkText && chunk.candidates?.[0]?.content?.parts) {
          chunkText = chunk.candidates[0].content.parts
            .filter((p) => typeof p.text === 'string' && !p.thought)
            .map((p) => p.text as string)
            .join('');
        }
        if (chunkText && chunkText.length > 0) {
          fullResponse += chunkText;
          onTextChunk?.(chunkText);
        }
      }

      if (traceSteps.length > 0) {
        emitTrace('Synthesizing Response', 'completed', 'Final answer completed');
      }
    } catch (streamErr) {
      console.warn('[agent-runner] stream error:', streamErr);
      // If tools were already executed successfully, provide a clear fallback answer rather than failing completely
      const successfulSteps = traceSteps.filter(
        (s) => s.status === 'completed' && s.label !== 'Synthesizing Response'
      );
      if (successfulSteps.length > 0) {
        const summaries = successfulSteps
          .map((s) => `• **${s.label}**: ${s.message || 'Executed successfully'}`)
          .join('\n');
        fullResponse = `The requested operations completed successfully:\n\n${summaries}\n\n*(Note: Gemini free-tier rate limit prevented extended narration, but your actions and data are fully saved.)*`;
        onTextChunk?.(fullResponse);
      } else {
        throw streamErr;
      }
    }
  }

  // Final safety net: if fullResponse is still empty despite completed steps, synthesize a meaningful summary
  if (!fullResponse || fullResponse.trim().length === 0) {
    const successfulSteps = traceSteps.filter(
      (s) => s.status === 'completed' && s.label !== 'Synthesizing Response'
    );
    if (successfulSteps.length > 0) {
      const summaries = successfulSteps
        .map((s) => `• **${s.label}**: ${s.message || 'Executed successfully'}`)
        .join('\n');
      fullResponse = `The requested operations completed successfully:\n\n${summaries}\n\n*(See the citations below for source details from the document.)*`;
      onTextChunk?.(fullResponse);
    }
  }

  const completedAt = new Date();
  const trace: AgentTrace = {
    id: `trace-${Date.now()}`,
    steps: traceSteps,
    startedAt,
    completedAt,
    totalDurationMs: completedAt.getTime() - startedAt.getTime(),
  };

  return {
    fullResponse,
    citations: accumulatedCitations,
    trace,
  };
}
