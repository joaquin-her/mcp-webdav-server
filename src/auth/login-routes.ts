import express, { Router } from 'express';
import { SingleUserOAuthProvider } from './single-user-oauth-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('LoginRoutes');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLoginPage(sessionId: string, clientName: string | undefined, error?: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Sign in</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 360px; margin: 80px auto; }
  h1 { font-size: 1.25rem; }
  label { display: block; margin-top: 12px; font-size: 0.9rem; }
  input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  button { margin-top: 20px; width: 100%; padding: 10px; }
  .error { color: #b00020; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>Sign in${clientName ? ` to authorize ${escapeHtml(clientName)}` : ''}</h1>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
  <form method="POST" action="/login">
    <input type="hidden" name="session" value="${escapeHtml(sessionId)}">
    <label>Username<input type="text" name="username" autofocus></label>
    <label>Password<input type="password" name="password"></label>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

export function createLoginRouter(provider: SingleUserOAuthProvider): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  router.get('/login', (req, res) => {
    const sessionId = req.query.session as string;
    const pending = provider.getPendingLogin(sessionId);
    if (!pending) {
      res.status(400).send('Login session expired or invalid. Please restart the authorization flow.');
      return;
    }
    res.type('html').send(renderLoginPage(sessionId, pending.client.client_name));
  });

  router.post('/login', async (req, res) => {
    const { session: sessionId, username, password } = req.body as {
      session?: string;
      username?: string;
      password?: string;
    };

    if (!sessionId || !provider.getPendingLogin(sessionId)) {
      res.status(400).send('Login session expired or invalid. Please restart the authorization flow.');
      return;
    }

    const valid = await provider.verifyCredentials(username ?? '', password ?? '');
    if (!valid) {
      const pending = provider.getPendingLogin(sessionId);
      res.status(401).type('html').send(renderLoginPage(sessionId, pending?.client.client_name, 'Invalid username or password.'));
      return;
    }

    const completed = await provider.completeLogin(sessionId, res);
    if (!completed) {
      logger.warn('Login session expired between GET and POST', { sessionId });
    }
  });

  return router;
}
