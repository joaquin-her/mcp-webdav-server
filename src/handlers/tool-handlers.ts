import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebDAVService } from '../services/webdav-service.js';
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ToolCall');

/**
 * Wraps a tool callback to log its invocation (name, arguments, result) at
 * DEBUG level. Controlled via the LOG_LEVEL env var (see utils/logger.ts) —
 * a no-op at the default 'info' level.
 */
function withDebugLogging<Args extends Record<string, unknown>, Result>(
  toolName: string,
  callback: (args: Args) => Promise<Result>
): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    logger.debug(`tools/call ${toolName} started`, { arguments: args });
    try {
      const result = await callback(args);
      logger.debug(`tools/call ${toolName} completed`, { result });
      return result;
    } catch (error) {
      logger.debug(`tools/call ${toolName} threw`, { error: (error as Error).message });
      throw error;
    }
  };
}

export function setupToolHandlers(server: McpServer, webdavService: WebDAVService) {
  // Create file tool
  server.tool(
    'webdav_create_remote_file',
    'Create a new file on a remote WebDAV server at the specified path. ' +
      'For binary files (PDFs, images, etc.), set encoding to "base64" and ' +
      'pass base64-encoded content — plain "utf8" text corrupts binary data.',
    {
      path: z.string().min(1, 'Path must not be empty'),
      content: z.string(),
      encoding: z.enum(['utf8', 'base64']).optional().default('utf8'),
      overwrite: z.boolean().optional().default(false)
    },
    withDebugLogging('webdav_create_remote_file', async ({ path, content, encoding, overwrite }) => {
      try {
        // Check if file exists and respect overwrite flag
        const exists = await webdavService.exists(path);
        if (exists && !overwrite) {
          return {
            content: [{
              type: 'text',
              text: `Error: File already exists at ${path}. Use overwrite=true to replace it.`
            }],
            isError: true
          };
        }

        await webdavService.writeFile(path, content, encoding);

        return {
          content: [{
            type: 'text',
            text: `File created successfully at ${path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating file: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Read file tool
  server.tool(
    'webdav_get_remote_file',
    'Retrieve content from a file stored on a remote WebDAV server. ' +
      'For binary files (PDFs, images, etc.), set encoding to "base64" to ' +
      'get the raw bytes back losslessly — plain "utf8" text corrupts binary data.',
    {
      path: z.string().min(1, 'Path must not be empty'),
      encoding: z.enum(['utf8', 'base64']).optional().default('utf8')
    },
    withDebugLogging('webdav_get_remote_file', async ({ path, encoding }) => {
      try {
        const content = await webdavService.readFile(path, encoding);

        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error reading file: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Update file tool
  server.tool(
    'webdav_update_remote_file',
    'Update an existing file on a remote WebDAV server with new content. ' +
      'For binary files (PDFs, images, etc.), set encoding to "base64" and ' +
      'pass base64-encoded content — plain "utf8" text corrupts binary data.',
    {
      path: z.string().min(1, 'Path must not be empty'),
      content: z.string(),
      encoding: z.enum(['utf8', 'base64']).optional().default('utf8')
    },
    withDebugLogging('webdav_update_remote_file', async ({ path, content, encoding }) => {
      try {
        // Check if file exists
        const exists = await webdavService.exists(path);
        if (!exists) {
          return {
            content: [{
              type: 'text',
              text: `Error: File does not exist at ${path}`
            }],
            isError: true
          };
        }

        await webdavService.writeFile(path, content, encoding);

        return {
          content: [{
            type: 'text',
            text: `File updated successfully at ${path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error updating file: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Delete file or directory tool
  server.tool(
    'webdav_delete_remote_item',
    'Delete a file or directory from a remote WebDAV server',
    {
      path: z.string().min(1, 'Path must not be empty')
    },
    withDebugLogging('webdav_delete_remote_item', async ({ path }) => {
      try {
        // Check if path exists
        const exists = await webdavService.exists(path);
        if (!exists) {
          return {
            content: [{
              type: 'text',
              text: `Error: Path does not exist at ${path}`
            }],
            isError: true
          };
        }

        await webdavService.delete(path);

        return {
          content: [{
            type: 'text',
            text: `Successfully deleted ${path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error deleting: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Create directory tool
  server.tool(
    'webdav_create_remote_directory',
    'Create a new directory on a remote WebDAV server',
    {
      path: z.string().min(1, 'Path must not be empty')
    },
    withDebugLogging('webdav_create_remote_directory', async ({ path }) => {
      try {
        await webdavService.createDirectory(path);

        return {
          content: [{
            type: 'text',
            text: `Directory created successfully at ${path}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating directory: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Move/rename file or directory tool
  server.tool(
    'webdav_move_remote_item',
    'Move or rename a file or directory on a remote WebDAV server',
    {
      fromPath: z.string().min(1, 'Source path must not be empty'),
      toPath: z.string().min(1, 'Destination path must not be empty'),
      overwrite: z.boolean().optional().default(false)
    },
    withDebugLogging('webdav_move_remote_item', async ({ fromPath, toPath, overwrite }) => {
      try {
        // Check if source exists
        const sourceExists = await webdavService.exists(fromPath);
        if (!sourceExists) {
          return {
            content: [{
              type: 'text',
              text: `Error: Source path does not exist at ${fromPath}`
            }],
            isError: true
          };
        }

        // Check if destination exists and respect overwrite flag
        const destExists = await webdavService.exists(toPath);
        if (destExists && !overwrite) {
          return {
            content: [{
              type: 'text',
              text: `Error: Destination already exists at ${toPath}. Use overwrite=true to replace it.`
            }],
            isError: true
          };
        }

        await webdavService.move(fromPath, toPath);

        return {
          content: [{
            type: 'text',
            text: `Successfully moved ${fromPath} to ${toPath}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error moving: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // Copy file or directory tool
  server.tool(
    'webdav_copy_remote_item',
    'Copy a file or directory to a new location on a remote WebDAV server',
    {
      fromPath: z.string().min(1, 'Source path must not be empty'),
      toPath: z.string().min(1, 'Destination path must not be empty'),
      overwrite: z.boolean().optional().default(false)
    },
    withDebugLogging('webdav_copy_remote_item', async ({ fromPath, toPath, overwrite }) => {
      try {
        // Check if source exists
        const sourceExists = await webdavService.exists(fromPath);
        if (!sourceExists) {
          return {
            content: [{
              type: 'text',
              text: `Error: Source path does not exist at ${fromPath}`
            }],
            isError: true
          };
        }

        // Check if destination exists and respect overwrite flag
        const destExists = await webdavService.exists(toPath);
        if (destExists && !overwrite) {
          return {
            content: [{
              type: 'text',
              text: `Error: Destination already exists at ${toPath}. Use overwrite=true to replace it.`
            }],
            isError: true
          };
        }

        await webdavService.copy(fromPath, toPath);

        return {
          content: [{
            type: 'text',
            text: `Successfully copied ${fromPath} to ${toPath}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error copying: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );

  // List directory tool
  server.tool(
    'webdav_list_remote_directory',
    'List files and directories at the specified path on a remote WebDAV server',
    {
      path: z.string().optional().default('/')
    },
    withDebugLogging('webdav_list_remote_directory', async ({ path }) => {
      try {
        const files = await webdavService.list(path);

        // Format response
        const formattedFiles = files.map(file => ({
          name: file.basename,
          path: file.filename,
          type: file.type,
          size: file.size,
          lastModified: file.lastmod
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedFiles, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing directory: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    })
  );
}