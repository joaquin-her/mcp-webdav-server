# Publishing to npm

This document provides instructions for publishing the WebDAV MCP Server to npm.

## Prerequisites

1. **npm Account**: Create an account on [npmjs.com](https://www.npmjs.com/) if you don't have one
2. **Login to npm**: Login to your npm account from the command line
   ```bash
   npm login
   ```

## Preparation

1. **Update Version**: The package follows [semantic versioning](https://semver.org/):
   - PATCH (1.0.x): Backward compatible bug fixes
   - MINOR (1.x.0): Backward compatible new features
   - MAJOR (x.0.0): Breaking changes

2. **Test the Package**: Make sure all tests pass
   ```bash
   npm test
   ```

3. **Build the Package**: Ensure the TypeScript compilation works
   ```bash
   npm run build
   ```

## Publishing Workflow

### Option 1: Manual Publishing

1. **Update version in package.json**
2. **Build the project**: `npm run build`
3. **Create a package**: `npm pack`
4. **Test the package**: Install it locally in another project
5. **Publish to npm**: `npm publish --access=public`

### Option 2: Using Scripts

We've added convenience scripts for publishing:

```bash
# Patch version (bug fixes)
npm run publish:patch

# Minor version (new features)
npm run publish:minor

# Major version (breaking changes)
npm run publish:major
```

These scripts will:
1. Update the version number
2. Run tests and build
3. Publish to npm

## Testing Published Package

After publishing, you can test the package by installing it from npm:

```bash
# Install globally
npm install -g webdav-mcp-server

# Or as a dependency in another project
npm install webdav-mcp-server
```

## Notes

- The `prepublishOnly` script runs before publishing to ensure the code is built and tested
- Only the necessary files are included in the package (specified in the `files` field in package.json)
- The `.npmignore` file excludes development-related files from the package

## Troubleshooting

- **Authentication Issues**: If you encounter authentication issues, try `npm logout` and then `npm login` again
- **Versioning Conflicts**: If the version already exists, update the version number in package.json
- **Permission Errors**: Ensure you have the appropriate rights to publish the package (especially if using a scoped package)
