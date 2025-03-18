# WebDAV Password Encryption

This document explains how to use bcrypt-encrypted passwords with the WebDAV MCP Server.

## Why Use Encrypted Passwords?

When connecting to a WebDAV server, you need to provide authentication credentials. Storing these credentials in plain text in your environment variables or configuration files poses a security risk. By using bcrypt-encrypted passwords:

1. Your WebDAV password is never stored in plain text
2. The hash cannot be easily reversed to obtain the original password
3. Even if your .env file or configuration is exposed, your actual WebDAV password remains protected

## How It Works

The WebDAV MCP Server supports bcrypt-hashed passwords using the following format:

```
{bcrypt}$2y$10$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy
```

When the server initializes:
1. It detects if the `WEBDAV_PASSWORD` environment variable starts with `{bcrypt}`
2. If it does, it extracts the bcrypt hash (everything after the prefix)
3. The hash is then passed to the WebDAV client for authentication

## Generating a Bcrypt Hash

You can generate a bcrypt hash for your password using the built-in utility:

```bash
# Using the npm script
npm run generate-hash -- yourpassword [rounds]

# Or with npx
npx webdav-mcp-generate-hash yourpassword [rounds]

# Or directly, if built from source
node dist/utils/generate-hash.js yourpassword [rounds]
```

The optional `rounds` parameter (default: 10) determines the computational complexity of the hash. Higher values are more secure but slower to compute.

## Adding to Your Environment

Once you have generated the hash, add it to your `.env` file:

```env
WEBDAV_PASSWORD={bcrypt}$2y$10$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy
```

Or when using Docker:

```bash
docker run -p 3000:3000 \
  -e WEBDAV_USERNAME=admin \
  -e WEBDAV_PASSWORD="{bcrypt}$2y$10$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy" \
  webdav-mcp-server
```

## Security Considerations

1. **Hash Strength**: Use at least 10 rounds for bcrypt (the default) to ensure adequate security
2. **Environment Security**: Even with encrypted passwords, keep your .env file secure
3. **Transport Security**: Use HTTPS when connecting to remote WebDAV servers
4. **Password Rotation**: Periodically update your passwords and their corresponding hashes

## Programmatic Usage

When using the WebDAV MCP Server programmatically, you can provide encrypted passwords the same way:

```javascript
import { startWebDAVServer } from 'webdav-mcp-server';

await startWebDAVServer({
  webdavConfig: {
    rootUrl: 'https://your-webdav-server',
    rootPath: '/webdav',
    username: 'admin',
    password: '{bcrypt}$2y$10$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy'
  },
  useHttp: false
});
```

## Troubleshooting

If you experience authentication issues:

1. Verify that your bcrypt hash is correct and properly formatted
2. Ensure you're using the correct prefix: `{bcrypt}`
3. Check that your WebDAV server supports basic authentication
4. Verify that the hashed password corresponds to the correct plaintext password
