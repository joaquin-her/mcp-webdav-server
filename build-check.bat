@echo off
echo Running TypeScript compiler to check for errors...
cd /d I:\Projects\Claudes\webdav-mcp-server
npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
  echo Build failed with errors!
  exit /b 1
) else (
  echo Build check successful! No TypeScript errors found.
)
