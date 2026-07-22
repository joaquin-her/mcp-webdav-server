import { randomUUID, randomBytes } from 'node:crypto';
import { Response } from 'express';
import { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { verifyPassword } from '../utils/password-utils.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OAuthProvider');

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const LOGIN_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredAuthCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  resource?: string;
  expiresAt: number;
}

interface StoredToken {
  clientId: string;
  expiresAt: number;
}

interface PendingLogin {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

export interface SingleUserCredentials {
  username: string;
  password: string;
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): OAuthClientInformationFull {
    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000)
    };
    this.clients.set(fullClient.client_id, fullClient);
    logger.info('Registered new OAuth client', { clientId: fullClient.client_id, name: client.client_name });
    return fullClient;
  }
}

/**
 * Single-user OAuth 2.1 provider (authorization code + PKCE) backed entirely
 * by in-memory state. There is exactly one "account", authenticated against
 * fixed AUTH_USERNAME/AUTH_PASSWORD credentials, matching the model already
 * used for HTTP Basic Auth in this server.
 */
export class SingleUserOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();

  private authCodes = new Map<string, StoredAuthCode>();
  private accessTokens = new Map<string, StoredToken>();
  private refreshTokens = new Map<string, StoredToken>();
  private pendingLogins = new Map<string, PendingLogin>();

  constructor(private credentials: SingleUserCredentials) {}

  /**
   * Renders a login form (GET) or validates submitted credentials (handled
   * by the /login-submit route, see auth-routes.ts) before redirecting back
   * to the client's redirect_uri with an authorization code.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const loginSessionId = randomUUID();
    this.pendingLogins.set(loginSessionId, {
      client,
      params,
      expiresAt: Date.now() + LOGIN_SESSION_TTL_MS
    });

    res.redirect(`/login?session=${loginSessionId}`);
  }

  /**
   * Called by the login form handler once credentials are verified.
   * Issues the authorization code and redirects back to the client.
   */
  async completeLogin(loginSessionId: string, res: Response): Promise<boolean> {
    const pending = this.pendingLogins.get(loginSessionId);
    this.pendingLogins.delete(loginSessionId);

    if (!pending || pending.expiresAt < Date.now()) {
      return false;
    }

    const code = randomBytes(32).toString('hex');
    this.authCodes.set(code, {
      clientId: pending.client.client_id,
      codeChallenge: pending.params.codeChallenge,
      redirectUri: pending.params.redirectUri,
      resource: pending.params.resource?.toString(),
      expiresAt: Date.now() + AUTH_CODE_TTL_MS
    });

    const redirectUrl = new URL(pending.params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.params.state) {
      redirectUrl.searchParams.set('state', pending.params.state);
    }
    res.redirect(redirectUrl.toString());
    return true;
  }

  getPendingLogin(loginSessionId: string): PendingLogin | undefined {
    const pending = this.pendingLogins.get(loginSessionId);
    if (!pending || pending.expiresAt < Date.now()) return undefined;
    return pending;
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    if (username !== this.credentials.username) return false;
    return verifyPassword(password, this.credentials.password);
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new Error('Invalid or expired authorization code');
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new Error('Invalid or expired authorization code');
    }
    if (stored.clientId !== client.client_id) {
      throw new Error('Authorization code was not issued to this client');
    }
    this.authCodes.delete(authorizationCode);

    return this.issueTokens(client.client_id);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored || stored.expiresAt < Date.now() || stored.clientId !== client.client_id) {
      throw new Error('Invalid or expired refresh token');
    }
    this.refreshTokens.delete(refreshToken);

    return this.issueTokens(client.client_id);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      throw new Error('Invalid or expired access token');
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: ['mcp'],
      expiresAt: Math.floor(stored.expiresAt / 1000)
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.accessTokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  private issueTokens(clientId: string): OAuthTokens {
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;

    this.accessTokens.set(accessToken, { clientId, expiresAt });
    this.refreshTokens.set(refreshToken, { clientId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: 'mcp'
    };
  }
}

