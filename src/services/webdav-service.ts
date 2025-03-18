import { createClient, WebDAVClient, AuthType } from 'webdav';
import { processPassword } from '../utils/password-utils.js';

// Define our own FileStat interface to match what we use in the application
export interface FileStat {
  filename: string;
  basename: string;
  lastmod?: string;
  size?: number;
  type: 'file' | 'directory';
  mime?: string;
  [key: string]: any;
}

// Define interfaces for response types
interface ResponseData {
  status?: number;
  data?: any;
  [key: string]: any;
}

export interface WebDAVConfig {
  rootUrl: string;
  rootPath: string;
  username: string;
  password: string;
}

export class WebDAVService {
  private client: WebDAVClient;
  private rootPath: string;

  constructor(config: WebDAVConfig) {
    // Process the password to handle bcrypt format
    const processedPassword = processPassword(config.password);
    
    // In v5.x, the client options structure has changed
    this.client = createClient(config.rootUrl, {
      authType: AuthType.Password,
      username: config.username,
      password: processedPassword
    });
    
    this.rootPath = config.rootPath;
  }

  /**
   * List files and directories at the specified path
   */
  async list(path: string = '/'): Promise<FileStat[]> {
    const fullPath = this.getFullPath(path);
    try {
      // In v5.x we need to handle the response differently
      const result = await this.client.getDirectoryContents(fullPath);
      
      // Convert the result to our FileStat interface
      return Array.isArray(result) 
        ? result.map(item => this.convertToFileStat(item))
        : this.isResponseData(result) && Array.isArray(result.data)
          ? result.data.map(item => this.convertToFileStat(item))
          : [];
    } catch (error) {
      console.error(`Error listing directory ${fullPath}:`, error);
      throw new Error(`Failed to list directory: ${(error as Error).message}`);
    }
  }

  /**
   * Get file stats for a specific path
   */
  async stat(path: string): Promise<FileStat> {
    const fullPath = this.getFullPath(path);
    try {
      const result = await this.client.stat(fullPath);
      
      // Convert the result to our FileStat interface
      return this.convertToFileStat(
        this.isResponseData(result) ? result.data : result
      );
    } catch (error) {
      console.error(`Error getting stats for ${fullPath}:`, error);
      throw new Error(`Failed to get file stats: ${(error as Error).message}`);
    }
  }

  /**
   * Read file content as text
   */
  async readFile(path: string): Promise<string> {
    const fullPath = this.getFullPath(path);
    try {
      // v5.x returns buffer by default, need to use format: 'text'
      const content = await this.client.getFileContents(fullPath, { format: 'text' });
      
      // Handle both direct string response and detailed response
      if (typeof content === 'string') {
        return content;
      } else if (this.isResponseData(content)) {
        return String(content.data);
      }
      
      throw new Error("Unexpected response format from server");
    } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error);
      throw new Error(`Failed to read file: ${(error as Error).message}`);
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const fullPath = this.getFullPath(path);
    try {
      // putFileContents in v5.x returns a boolean indicating success
      const result = await this.client.putFileContents(fullPath, content);
      
      // Check result based on type
      if (typeof result === 'boolean' && !result) {
        throw new Error("Failed to write file: server returned failure status");
      } else if (this.isResponseData(result) && 
                 result.status !== undefined && 
                 result.status !== 201 && 
                 result.status !== 204) {
        throw new Error(`Failed to write file: server returned status ${result.status}`);
      }
    } catch (error) {
      console.error(`Error writing to file ${fullPath}:`, error);
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(path: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    try {
      // createDirectory in v5.x returns a boolean indicating success
      const result = await this.client.createDirectory(fullPath);
      
      // Check result based on type
      if (typeof result === 'boolean' && !result) {
        throw new Error("Failed to create directory: server returned failure status");
      } else if (this.isResponseData(result) && 
                 result.status !== undefined && 
                 result.status !== 201 && 
                 result.status !== 204) {
        throw new Error(`Failed to create directory: server returned status ${result.status}`);
      }
    } catch (error) {
      console.error(`Error creating directory ${fullPath}:`, error);
      throw new Error(`Failed to create directory: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a file or directory
   */
  async delete(path: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    try {
      // deleteFile in v5.x returns a boolean indicating success
      const result = await this.client.deleteFile(fullPath);
      
      // Check result based on type
      if (typeof result === 'boolean' && !result) {
        throw new Error("Failed to delete: server returned failure status");
      } else if (this.isResponseData(result) && 
                 result.status !== undefined && 
                 result.status !== 204) {
        throw new Error(`Failed to delete: server returned status ${result.status}`);
      }
    } catch (error) {
      console.error(`Error deleting ${fullPath}:`, error);
      throw new Error(`Failed to delete: ${(error as Error).message}`);
    }
  }

  /**
   * Move/rename a file or directory
   */
  async move(fromPath: string, toPath: string): Promise<void> {
    const fullFromPath = this.getFullPath(fromPath);
    const fullToPath = this.getFullPath(toPath);
    try {
      // moveFile in v5.x returns a boolean indicating success
      const result = await this.client.moveFile(fullFromPath, fullToPath);
      
      // Check result based on type
      if (typeof result === 'boolean' && !result) {
        throw new Error("Failed to move: server returned failure status");
      } else if (this.isResponseData(result) && 
                 result.status !== undefined && 
                 result.status !== 201 && 
                 result.status !== 204) {
        throw new Error(`Failed to move: server returned status ${result.status}`);
      }
    } catch (error) {
      console.error(`Error moving from ${fullFromPath} to ${fullToPath}:`, error);
      throw new Error(`Failed to move: ${(error as Error).message}`);
    }
  }

  /**
   * Copy a file or directory
   */
  async copy(fromPath: string, toPath: string): Promise<void> {
    const fullFromPath = this.getFullPath(fromPath);
    const fullToPath = this.getFullPath(toPath);
    try {
      // copyFile in v5.x returns a boolean indicating success
      const result = await this.client.copyFile(fullFromPath, fullToPath);
      
      // Check result based on type
      if (typeof result === 'boolean' && !result) {
        throw new Error("Failed to copy: server returned failure status");
      } else if (this.isResponseData(result) && 
                 result.status !== undefined && 
                 result.status !== 201 && 
                 result.status !== 204) {
        throw new Error(`Failed to copy: server returned status ${result.status}`);
      }
    } catch (error) {
      console.error(`Error copying from ${fullFromPath} to ${fullToPath}:`, error);
      throw new Error(`Failed to copy: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a file or directory exists
   */
  async exists(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);
    try {
      const result = await this.client.exists(fullPath);
      
      // Handle both boolean and object responses
      if (typeof result === 'boolean') {
        return result;
      }
      
      // Check if result is an object with a status property
      if (result && typeof result === 'object') {
        // Use type guard for better type safety
        const responseData = result as ResponseData;
        if (responseData.status !== undefined) {
          return responseData.status < 400; // If status is less than 400, the resource exists
        }
      }
      
      // Default return if the result type is unexpected
      return false;
    } catch (error) {
      console.error(`Error checking existence of ${fullPath}:`, error);
      return false;
    }
  }

  /**
   * Type guard to check if an object is a ResponseData
   */
  private isResponseData(value: any): value is ResponseData {
    return value !== null && 
           typeof value === 'object' && 
           'status' in value;
  }

  /**
   * Get the full path by combining root path with the provided path
   */
  private getFullPath(path: string): string {
    // Make sure path starts with / but not with //
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Combine root path with the provided path
    if (this.rootPath === '/') {
      return normalizedPath;
    }
    
    const rootWithoutTrailingSlash = this.rootPath.endsWith('/')
      ? this.rootPath.slice(0, -1)
      : this.rootPath;
      
    return `${rootWithoutTrailingSlash}${normalizedPath}`;
  }

  /**
   * Convert a WebDAV response to our FileStat interface
   */
  private convertToFileStat(item: any): FileStat {
    if (!item) {
      return {
        filename: '',
        basename: '',
        type: 'file'
      };
    }
    
    return {
      filename: item.filename || item.href || '',
      basename: item.basename || this.getBasenameFromPath(item.filename || item.href || ''),
      type: item.type || (item.mime?.includes('directory') ? 'directory' : 'file'),
      size: item.size,
      lastmod: item.lastmod,
      mime: item.mime,
      ...item
    };
  }

  /**
   * Extract basename from a path
   */
  private getBasenameFromPath(path: string): string {
    if (!path) return '';
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }
}
