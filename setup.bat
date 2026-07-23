@echo off
setlocal

echo WebDAV MCP Server Setup
echo =======================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed. Please install Node.js 20 or later.
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1,2,3 delims=v." %%a in ('node -v') do (
    set NODE_MAJOR_VERSION=%%b
)

if %NODE_MAJOR_VERSION% LSS 20 (
    echo Error: Node.js version 20 or higher is required. You have version v%NODE_MAJOR_VERSION%.
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
call npm install

REM Build the project
echo Building the project...
call npm run build

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating default .env file...
    copy .env.example .env
    echo Please edit .env file with your WebDAV credentials.
)

echo.
echo Setup completed successfully!
echo.
echo To start the server, run:
echo   npm start         # For stdio transport (Claude Desktop command mode)
echo   npm start -- --http  # For HTTP transport (Claude Desktop HTTP mode)
echo.
echo For more information, see README.md and CLAUDE_INTEGRATION.md
