@echo off
setlocal

echo Creating npm package...
echo ======================
echo.

cd /d I:\Projects\Claudes\webdav-mcp-server

echo Running build...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo Build failed!
  exit /b 1
)

echo Creating package...
call npm pack
if %ERRORLEVEL% NEQ 0 (
  echo Package creation failed!
  exit /b 1
)

echo.
echo Package created successfully!
echo You can now test it locally with:
echo   npm install ./webdav-mcp-server-1.0.0.tgz
echo.
echo Or publish it to npm with:
echo   npm publish --access=public
echo.
