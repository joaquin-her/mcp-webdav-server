import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { SingleUserOAuthProvider } from '../auth/single-user-oauth-provider.js';
import { createLoginRouter } from '../auth/login-routes.js';
import { createLogger } from '../utils/logger.js';

export interface ExpressServerConfig {
  port: number;
  auth?: {
    username?: string;
    password?: string;
    enabled?: boolean;
  };
}

function resolvePublicUrl(port: number): URL {
  const explicit = process.env.PUBLIC_URL;
  if (explicit) return new URL(explicit);

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return new URL(`https://${railwayDomain}`);

  return new URL(`http://localhost:${port}`);
}

export function setupExpressServer(server: McpServer, config: ExpressServerConfig): express.Application {
  const logger = createLogger('ExpressServer');
  const app = express();

  const authEnabled = config.auth?.enabled ?? (process.env.AUTH_ENABLED === 'true');
  const username = config.auth?.username || process.env.AUTH_USERNAME;
  const password = config.auth?.password || process.env.AUTH_PASSWORD;

  const publicUrl = resolvePublicUrl(config.port);
  const mcpResourceUrl = new URL('/mcp', publicUrl);

  if (authEnabled && username && password) {
    const provider = new SingleUserOAuthProvider({ username, password });

    app.use(mcpAuthRouter({
      provider,
      issuerUrl: publicUrl,
      resourceServerUrl: mcpResourceUrl
    }));
    app.use(createLoginRouter(provider));

    app.use(
      '/mcp',
      express.json(),
      requireBearerAuth({
        verifier: provider,
        resourceMetadataUrl: `${publicUrl.origin}/.well-known/oauth-protected-resource/mcp`
      })
    );

    logger.info('OAuth 2.1 authentication enabled for /mcp');
  } else {
    app.use('/mcp', express.json());
    logger.info('Authentication disabled for /mcp (AUTH_ENABLED is not true)');
  }

  // Map to store active Streamable HTTP transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null
          });
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport!);
            logger.info(`MCP session initialized: ${newSessionId}`);
          }
        });

        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) {
            transports.delete(sid);
            logger.info(`MCP session closed: ${sid}`);
          }
        };

        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling /mcp request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  // Health check endpoint (unauthenticated, for platform healthchecks)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      name: 'WebDAV MCP Server',
      version: '1.0.0',
      description: 'MCP Server for WebDAV operations with OAuth 2.1 authentication',
      activeSessions: transports.size
    });
  });

  app.listen(config.port, () => {
    logger.info(`HTTP server with Streamable HTTP transport listening on port ${config.port}`);
  });

  return app;
}
