export interface McpToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface McpServerConfig {
  name: string;
  description: string;
  version: string;
}
