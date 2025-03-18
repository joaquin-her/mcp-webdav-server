import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebDAVService } from '../services/webdav-service.js';
import { z } from 'zod';

export function setupToolHandlers(server: McpServer, webdavService: WebDAVService) {
  // Create file tool
  server.tool(
    'create-file',
    {
      path: z.string().min(1, 'Path must not be empty'),
      content: z.string(),
      overwrite: z.boolean().optional().default(false)
    },
    async ({ path, content, overwrite }) => {
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

        await webdavService.writeFile(path, content);
        
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
    }
  );

  // Read file tool
  server.tool(
    'read-file',
    {
      path: z.string().min(1, 'Path must not be empty')
    },
    async ({ path }) => {
      try {
        const content = await webdavService.readFile(path);
        
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
    }
  );

  // Update file tool
  server.tool(
    'update-file',
    {
      path: z.string().min(1, 'Path must not be empty'),
      content: z.string()
    },
    async ({ path, content }) => {
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

        await webdavService.writeFile(path, content);
        
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
    }
  );

  // Delete file or directory tool
  server.tool(
    'delete',
    {
      path: z.string().min(1, 'Path must not be empty')
    },
    async ({ path }) => {
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
    }
  );

  // Create directory tool
  server.tool(
    'create-directory',
    {
      path: z.string().min(1, 'Path must not be empty')
    },
    async ({ path }) => {
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
    }
  );

  // Move/rename file or directory tool
  server.tool(
    'move',
    {
      fromPath: z.string().min(1, 'Source path must not be empty'),
      toPath: z.string().min(1, 'Destination path must not be empty'),
      overwrite: z.boolean().optional().default(false)
    },
    async ({ fromPath, toPath, overwrite }) => {
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
    }
  );

  // Copy file or directory tool
  server.tool(
    'copy',
    {
      fromPath: z.string().min(1, 'Source path must not be empty'),
      toPath: z.string().min(1, 'Destination path must not be empty'),
      overwrite: z.boolean().optional().default(false)
    },
    async ({ fromPath, toPath, overwrite }) => {
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
    }
  );

  // List directory tool
  server.tool(
    'list-directory',
    {
      path: z.string().optional().default('/')
    },
    async ({ path }) => {
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
    }
  );
}
