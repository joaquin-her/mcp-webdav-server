import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createAuthMiddleware } from '../middleware/auth-middleware.js';

export function setupExpressServer(server: McpServer, port: number): express.Application {
  const app = express();
  app.use(express.json());

  // Map to store connected clients
  const clients = new Map<string, SSEServerTransport>();

  // Create auth middleware with environment variables
  const authMiddleware = createAuthMiddleware({
    username: process.env.AUTH_USERNAME || 'user',
    password: process.env.AUTH_PASSWORD || 'pass'
  });

  // Apply auth middleware to all routes
  app.use(authMiddleware);

  // SSE endpoint for client connection
  app.get('/sse', async (req, res) => {
    // Create transport for this client
    const transport = new SSEServerTransport('/messages', res);
    
    // Store the transport by its session ID
    clients.set(transport.sessionId, transport);
    
    // Start the SSE connection
    await transport.start();
    
    // Connect the server to this transport
    server.connect(transport).catch(error => {
      console.error(`Error connecting server to transport:`, error);
    });
    
    // Handle client disconnect
    req.on('close', () => {
      clients.delete(transport.sessionId);
      console.log(`Client ${transport.sessionId} disconnected`);
    });
  });

  // Message endpoint for client to server communication
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId || !clients.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    
    const transport = clients.get(sessionId)!;
    
    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error(`Error handling message for session ${sessionId}:`, error);
      // Note: handlePostMessage already sends appropriate response
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      name: 'WebDAV MCP Server',
      version: '1.0.0',
      description: 'MCP Server for WebDAV operations with basic authentication',
      connectedClients: clients.size
    });
  });

  // Start the server
  app.listen(port, () => {
    console.log(`HTTP server with SSE transport listening on port ${port}`);
  });

  return app;
}
