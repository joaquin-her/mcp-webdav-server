@echo off
setlocal

cd /d I:\Projects\Claudes\webdav-mcp-server

echo Building WebDAV MCP Server...
call npm run build > build-result.log 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Build failed. See build-result.log for details.
  exit /b 1
)

echo Build successful!
echo The WebDAV MCP Server has been built successfully.
exit /b 0
