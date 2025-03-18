import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebDAVService, WebDAVConfig } from './services/webdav-service.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { setupToolHandlers } from './handlers/tool-handlers.js';
import { setupPromptHandlers } from './handlers/prompt-handlers.js';
import { setupExpressServer } from './servers/express-server.js';

export interface HttpServerConfig {
  port: number;
  authUsername: string;
  authPassword: string;
}

export interface ServerOptions {
  webdavConfig: WebDAVConfig;
  useHttp?: boolean;
  httpConfig?: HttpServerConfig;
}

/**
 * Start the WebDAV MCP Server with the provided configuration
 * 
 * @param options Server configuration options
 * @returns A promise that resolves when the server is started
 */
export async function startWebDAVServer(options: ServerOptions): Promise<void> {
  const { webdavConfig, useHttp = false, httpConfig } = options;
  
  try {
    // Initialize the WebDAV service
    const webdavService = new WebDAVService(webdavConfig);

    // Create the MCP server
    const server = new McpServer({
      name: 'WebDAV Server',
      version: '1.0.0',
      description: 'MCP Server for WebDAV operations with basic authentication'
    });

    // Set up handlers
    setupResourceHandlers(server, webdavService);
    setupToolHandlers(server, webdavService);
    setupPromptHandlers(server);

    if (useHttp) {
      if (!httpConfig) {
        throw new Error('HTTP configuration is required when useHttp is true');
      }
      
      // Configure environment variables for Express server
      process.env.AUTH_USERNAME = httpConfig.authUsername;
      process.env.AUTH_PASSWORD = httpConfig.authPassword;
      
      // Start Express server with SSE transport
      setupExpressServer(server, httpConfig.port);
      console.log(`HTTP server started on port ${httpConfig.port}`);
    } else {
      // Use stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}

// Re-export types
export { WebDAVConfig, WebDAVService } from './services/webdav-service.js';
