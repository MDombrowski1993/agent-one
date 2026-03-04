export type MCPServerType = 'stdio' | 'http' | 'sse';

export interface MCPStdioServer {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPHttpServer {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  oauth?: {
    clientId: string;
    callbackPort: number;
  };
}

export interface MCPSseServer {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type MCPServer = MCPStdioServer | MCPHttpServer | MCPSseServer;

export interface MCPServers {
  servers: Record<string, MCPServer>;
}

export interface MCPServerEntry {
  name: string;
  server: MCPServer;
  scope: 'global' | 'project';
  path: string;
}
