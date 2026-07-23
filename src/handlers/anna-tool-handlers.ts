import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnnaService, bookToText, paperToText } from '../services/anna-service.js';
import { WebDAVService } from '../services/webdav-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AnnaToolCall');

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

export function setupAnnaToolHandlers(server: McpServer, annaService: AnnaService, webdavService: WebDAVService) {
  server.tool(
    'book_search',
    "Search Anna's Archive for books by title, author, or topic. Returns book metadata including MD5 hash for downloading.",
    {
      query: z.string().min(1, 'Query must not be empty'),
      timeout_seconds: z.number().int().positive().optional()
    },
    withDebugLogging('book_search', async ({ query, timeout_seconds }) => {
      try {
        const books = await annaService.findBook(query, timeout_seconds ? timeout_seconds * 1000 : undefined);
        if (books.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No books found.' }] };
        }
        const text = books.map(bookToText).join('\n\n');
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error searching books: ${(error as Error).message}` }],
          isError: true
        };
      }
    })
  );

  server.tool(
    'book_download',
    'Download a book by its MD5 hash from search results and save it to the WebDAV server. ' +
      'Requires ANNAS_SECRET_KEY to be configured on the server. If ANNAS_SECRET_KEY=slow, ' +
      'no membership is used and this instead returns slow-download links for the user to ' +
      'open in a browser (the file is not fetched or saved server-side).',
    {
      hash: z.string().min(1, 'Hash must not be empty'),
      title: z.string().min(1, 'Title must not be empty'),
      format: z.string().optional().default('pdf'),
      webdav_path: z.string().min(1, 'Destination directory on the WebDAV server, e.g. "/Books"'),
      timeout_seconds: z.number().int().positive().optional()
    },
    withDebugLogging('book_download', async ({ hash, title, format, webdav_path, timeout_seconds }) => {
      try {
        if (annaService.isSlowMode()) {
          const links = annaService.getSlowDownloadLinks(hash);
          return {
            content: [{
              type: 'text' as const,
              text: `ANNAS_SECRET_KEY is set to "slow": open one of these links in a browser to download ` +
                `"${title}" (they require solving a browser challenge, so they can't be fetched automatically):\n\n` +
                links.join('\n')
            }]
          };
        }

        const result = await annaService.downloadBook(hash, title, format, timeout_seconds ? timeout_seconds * 1000 : undefined);
        const destPath = `${webdav_path.replace(/\/$/, '')}/${result.filename}`;
        await webdavService.writeFile(destPath, result.contentBase64, 'base64');
        return {
          content: [{ type: 'text' as const, text: `Book downloaded successfully to ${destPath}` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error downloading book: ${(error as Error).message}` }],
          isError: true
        };
      }
    })
  );

  server.tool(
    'article_search',
    "Search for academic articles/papers by DOI or keywords. Auto-detects if input is a DOI (starts with '10.') or a search term. Returns article metadata including DOI and hash.",
    {
      query: z.string().min(1, 'Query must not be empty'),
      timeout_seconds: z.number().int().positive().optional()
    },
    withDebugLogging('article_search', async ({ query, timeout_seconds }) => {
      try {
        const timeoutMs = timeout_seconds ? timeout_seconds * 1000 : undefined;
        if (query.trim().startsWith('10.')) {
          try {
            const paper = await annaService.lookupDOI(query, timeoutMs);
            return { content: [{ type: 'text' as const, text: paperToText(paper) }] };
          } catch {
            return { content: [{ type: 'text' as const, text: `No paper found for DOI: ${query}` }] };
          }
        }

        const papers = await annaService.findArticle(query, timeoutMs);
        if (papers.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No articles found.' }] };
        }
        const text = papers.map(paperToText).join('\n\n');
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error searching articles: ${(error as Error).message}` }],
          isError: true
        };
      }
    })
  );

  server.tool(
    'article_download',
    'Download an academic article/paper by its DOI and save it to the WebDAV server. ' +
      'Looks up the paper, then downloads via fast download (if ANNAS_SECRET_KEY is configured) or SciDB. ' +
      'If ANNAS_SECRET_KEY=slow, returns slow-download links for the user to open in a browser instead ' +
      '(the file is not fetched or saved server-side).',
    {
      doi: z.string().min(1, 'DOI must not be empty'),
      webdav_path: z.string().min(1, 'Destination directory on the WebDAV server, e.g. "/Papers"'),
      timeout_seconds: z.number().int().positive().optional()
    },
    withDebugLogging('article_download', async ({ doi, webdav_path, timeout_seconds }) => {
      try {
        const timeoutMs = timeout_seconds ? timeout_seconds * 1000 : undefined;
        const paper = await annaService.lookupDOI(doi, timeoutMs);

        if (annaService.isSlowMode() && paper.hash) {
          const links = annaService.getSlowDownloadLinks(paper.hash);
          return {
            content: [{
              type: 'text' as const,
              text: `ANNAS_SECRET_KEY is set to "slow": open one of these links in a browser to download ` +
                `"${paper.title || doi}" (they require solving a browser challenge, so they can't be fetched automatically):\n\n` +
                links.join('\n')
            }]
          };
        }

        let result;
        if (paper.hash && !annaService.isSlowMode()) {
          try {
            result = await annaService.downloadBook(paper.hash, paper.title || doi, 'pdf', timeoutMs);
          } catch (fastError) {
            logger.warn('Fast download failed, falling back to SciDB', { doi, error: (fastError as Error).message });
          }
        }

        if (!result) {
          result = await annaService.downloadPaper(paper, timeoutMs);
        }

        const destPath = `${webdav_path.replace(/\/$/, '')}/${result.filename}`;
        await webdavService.writeFile(destPath, result.contentBase64, 'base64');

        return {
          content: [{ type: 'text' as const, text: `Paper downloaded successfully to ${destPath}` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error downloading article: ${(error as Error).message}` }],
          isError: true
        };
      }
    })
  );
}
