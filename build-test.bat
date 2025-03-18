@echo off
setlocal

echo Build Test - WebDAV MCP Server
echo ==============================
echo.

cd /d I:\Projects\Claudes\webdav-mcp-server

echo Running TypeScript compilation...
call npx tsc
if %ERRORLEVEL% NEQ 0 (
  echo Build failed with errors.
  exit /b 1
)

echo.
echo Build successful! No TypeScript errors.
echo.
