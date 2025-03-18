import { Request, Response, NextFunction } from 'express';
import auth from 'basic-auth';

export function createAuthMiddleware(options: { username: string; password: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const credentials = auth(req);
    
    if (!credentials || 
        credentials.name !== options.username || 
        credentials.pass !== options.password) {
      res.setHeader('WWW-Authenticate', 'Basic realm="MCP WebDAV Server"');
      res.status(401).send('Unauthorized');
      return;
    }
    
    next();
  };
}
