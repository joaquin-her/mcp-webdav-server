@echo off
setlocal

cd /d I:\Projects\Claudes\webdav-mcp-server

echo WebDAV MCP Server - Build Verification
echo =====================================
echo.

echo Step 1: Clean previous build artifacts
if exist dist rmdir /s /q dist
echo.

echo Step 2: Run TypeScript compiler
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
  echo TypeScript compilation failed!
  exit /b 1
)
echo TypeScript compilation successful.
echo.

echo Step 3: Build the project
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo Build failed!
  exit /b 1
)
echo Build successful.
echo.

echo Step 4: Run tests
call npm test
if %ERRORLEVEL% NEQ 0 (
  echo Tests failed!
  exit /b 1
)
echo Tests passed.
echo.

echo Step 5: Verify output files
if not exist dist\index.js (
  echo Build output is missing essential files!
  exit /b 1
)
echo Output files verified.
echo.

echo Build verification completed successfully!
echo The WebDAV MCP Server is ready for use.
echo.
echo You can now run the server with:
echo   npm start           (for stdio transport - use with Claude Desktop)
echo   npm start -- --http (for HTTP transport - use for remote access)
echo.

exit /b 0
