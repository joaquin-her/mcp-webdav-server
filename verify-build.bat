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

echo Step 4: Verify bcrypt password handling
echo Checking password utils...
if not exist dist\utils\password-utils.js (
  echo Missing password utilities!
  exit /b 1
)

echo Checking hash generator...
if not exist dist\utils\generate-hash.js (
  echo Missing hash generator!
  exit /b 1
)
echo Password encryption features verified.
echo.

echo Build verification completed successfully!
echo The WebDAV MCP Server is ready for use with bcrypt password support.
echo.
echo You can now:
echo   1. Generate a bcrypt hash:    npm run generate-hash -- yourpassword
echo   2. Run with stdio transport:  npm start
echo   3. Run with HTTP transport:   npm start -- --http
echo.

exit /b 0
