@echo off
setlocal

cd /d I:\Projects\Claudes\webdav-mcp-server

echo Cleaning previous build artifacts...
if exist dist rmdir /s /q dist
echo.

echo Building WebDAV MCP Server...
call npm run build > build-result.log 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Build failed. See build-result.log for details.
  type build-result.log
  exit /b 1
)

echo.
echo Build successful!
echo The WebDAV MCP Server has been built successfully.
echo.
echo Output directory: dist/

# List the output files
dir /b dist

exit /b 0
