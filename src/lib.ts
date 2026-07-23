import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { WebDAVService, WebDAVConfig } from './services/webdav-service.js';
import { AnnaService, AnnaConfig } from './services/anna-service.js';
import { setupResourceHandlers } from './handlers/resource-handlers.js';
import { setupToolHandlers } from './handlers/tool-handlers.js';
import { setupAnnaToolHandlers } from './handlers/anna-tool-handlers.js';
import { setupPromptHandlers } from './handlers/prompt-handlers.js';
import { setupExpressServer } from './servers/express-server.js';
import { validateConfig, ValidatedServerOptions } from './config/validation.js';
import { createLogger, setLoggerServer } from './utils/logger.js';
import { webdavConnectionPool } from './services/webdav-connection-pool.js';

// Logger will be initialized after server creation

export interface HttpServerConfig {
  port: number;
  auth?: {
    username?: string;
    password?: string;
    realm?: string;
    enabled?: boolean;
  };
}

export interface ServerOptions {
  webdavConfig: WebDAVConfig;
  useHttp?: boolean;
  httpConfig?: HttpServerConfig;
  annaConfig?: AnnaConfig;
}

/**
 * Start the WebDAV MCP Server with the provided configuration
 * 
 * @param options Server configuration options
 * @returns A promise that resolves when the server is started
 */
export async function startWebDAVServer(options: ServerOptions): Promise<void> {
  try {
    // Validate the configuration
    const validatedOptions = validateConfig(options);
    const { webdavConfig, useHttp, httpConfig } = validatedOptions;

    // Initialize the WebDAV service
    const webdavService = new WebDAVService(webdavConfig);

    // Initialize the Anna's Archive service (search always works; downloads
    // require ANNAS_SECRET_KEY, checked lazily inside AnnaService)
    const annaService = new AnnaService(options.annaConfig);

    // Builds a fresh MCP server instance. A Server/McpServer can only be
    // connected to a single transport at a time, so Streamable HTTP (which
    // may serve multiple concurrent sessions) needs one instance per
    // session rather than one shared instance.
    function createMcpServer(): McpServer {
      const server = new McpServer({
        name: 'WebDAV Server',
        version: '1.0.1',
        description: 'MCP Server for WebDAV operations with configurable authentication'
      }, {
        capabilities: {
          logging: {},     // Support for logging
          prompts: {},     // Support for prompts
          resources: {},   // Support for resources
          tools: {}        // Support for tools
        }
      });

      setupResourceHandlers(server, webdavService);
      setupToolHandlers(server, webdavService);
      setupAnnaToolHandlers(server, annaService, webdavService);
      setupPromptHandlers(server);

      return server;
    }

    const bootstrapServer = createMcpServer();

    // Set the MCP server for all loggers to use
    setLoggerServer(bootstrapServer.server);

    // Now that the server is set up, we can create a logger
    const logger = createLogger('WebDAVServer');

    // Log startup information
    logger.info('WebDAV MCP Server started', {
      webdavUrl: webdavConfig.rootUrl,
      webdavAuthEnabled: webdavConfig.authEnabled,
      useHttp,
      httpPort: useHttp ? httpConfig?.port : undefined,
      httpAuthEnabled: useHttp ? httpConfig?.auth?.enabled : undefined
    });

    // Get connection pool stats for logging
    const poolStats = webdavConnectionPool.getStats();
    logger.info('WebDAV connection pool status', poolStats);

    if (useHttp) {
      // Start Express server with Streamable HTTP transport
      logger.info(`Starting HTTP server on port ${httpConfig!.port}`);
      setupExpressServer(createMcpServer, {
        port: httpConfig!.port,
        auth: httpConfig!.auth
      });
      logger.info(`HTTP server started on port ${httpConfig!.port}`);
    } else {
      // Use stdio transport with the single bootstrap instance
      logger.info('Starting server with stdio transport');
      const transport = new StdioServerTransport();
      await bootstrapServer.connect(transport);
      logger.info('Server connected with stdio transport');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}

// Re-export types
export { WebDAVConfig, WebDAVService } from './services/webdav-service.js';
