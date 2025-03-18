#!/bin/bash

# WebDAV MCP Server setup script
echo "WebDAV MCP Server Setup"
echo "======================="
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18 or later."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d '.' -f 1)
if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo "Error: Node.js version 18 or higher is required. You have version $NODE_VERSION."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project
echo "Building the project..."
npm run build

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    cp .env.example .env
    echo "Please edit .env file with your WebDAV credentials."
fi

echo
echo "Setup completed successfully!"
echo
echo "To start the server, run:"
echo "  npm start         # For stdio transport (Claude Desktop command mode)"
echo "  npm start -- --http  # For HTTP transport (Claude Desktop HTTP mode)"
echo
echo "For more information, see README.md and CLAUDE_INTEGRATION.md"
