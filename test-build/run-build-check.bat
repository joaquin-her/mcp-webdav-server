@echo off
cd /d %~dp0
echo Running build check...
node build-check.js
if %ERRORLEVEL% NEQ 0 (
  echo Build check failed with error code %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)
echo Build check succeeded!
exit /b 0
