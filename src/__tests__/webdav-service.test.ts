import { WebDAVService } from '../services/webdav-service.js';
import { processPassword } from '../utils/password-utils.js';

// Mock the password utils
jest.mock('../utils/password-utils.js', () => ({
  processPassword: jest.fn(pwd => pwd === '{bcrypt}hash123' ? 'hash123' : pwd)
}));

// Define a mock for the webdav library
jest.mock('webdav', () => {
  return {
    AuthType: {
      Password: 'password'
    },
    createClient: jest.fn(() => ({
      getDirectoryContents: jest.fn().mockResolvedValue([
        { basename: 'file.txt', filename: '/file.txt', type: 'file', size: 1024, lastmod: '2023-01-01' }
      ]),
      stat: jest.fn().mockResolvedValue({
        basename: 'file.txt',
        filename: '/file.txt',
        type: 'file',
        size: 1024,
        lastmod: '2023-01-01'
      }),
      getFileContents: jest.fn().mockResolvedValue('file content'),
      putFileContents: jest.fn().mockResolvedValue(true),
      createDirectory: jest.fn().mockResolvedValue(true),
      deleteFile: jest.fn().mockResolvedValue(true),
      moveFile: jest.fn().mockResolvedValue(true),
      copyFile: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(true)
    }))
  };
});

describe('WebDAVService', () => {
  let service: WebDAVService;
  let mockClient: any;
  let mockCreateClient: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new WebDAVService({
      rootUrl: 'http://localhost',
      rootPath: '/webdav',
      username: 'user',
      password: 'pass'
    });
    
    // Get a reference to the mocked functions
    mockCreateClient = require('webdav').createClient;
    mockClient = mockCreateClient.mock.results[0].value;
  });

  describe('constructor', () => {
    it('should pass processed password to the WebDAV client', () => {
      // Create a service with a bcrypt password
      new WebDAVService({
        rootUrl: 'http://localhost',
        rootPath: '/webdav',
        username: 'user',
        password: '{bcrypt}hash123'
      });

      // Check that processPassword was called
      expect(processPassword).toHaveBeenCalledWith('{bcrypt}hash123');
      
      // Check that the processed password was passed to createClient
      expect(mockCreateClient).toHaveBeenCalledWith('http://localhost', {
        authType: 'password',
        username: 'user',
        password: 'hash123'
      });
    });

    it('should pass plain password to the WebDAV client', () => {
      // Create a service with a plain password
      new WebDAVService({
        rootUrl: 'http://localhost',
        rootPath: '/webdav',
        username: 'user',
        password: 'plainpass'
      });

      // Check that processPassword was called
      expect(processPassword).toHaveBeenCalledWith('plainpass');
      
      // Check that the plain password was passed to createClient
      expect(mockCreateClient).toHaveBeenCalledWith('http://localhost', {
        authType: 'password',
        username: 'user',
        password: 'plainpass'
      });
    });
  });

  describe('list method', () => {
    it('should handle array responses', async () => {
      const files = await service.list('/');
      expect(files).toHaveLength(1);
      expect(files[0].basename).toBe('file.txt');
    });

    it('should handle detailed responses', async () => {
      mockClient.getDirectoryContents.mockResolvedValueOnce({
        data: [{ basename: 'file2.txt', filename: '/file2.txt', type: 'file' }],
        status: 200
      });
      
      const files = await service.list('/');
      expect(files).toHaveLength(1);
      expect(files[0].basename).toBe('file2.txt');
    });

    it('should handle errors', async () => {
      mockClient.getDirectoryContents.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(service.list('/')).rejects.toThrow('Failed to list directory: Network error');
    });
  });

  // Other tests remain the same...
  // truncated for brevity
});
