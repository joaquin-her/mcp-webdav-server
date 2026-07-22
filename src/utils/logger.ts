/**
 * Logger utility that uses the MCP SDK's logging mechanism
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Global server reference for logging
let globalMcpServer: Server | null = null;

const LOG_LEVELS = ['error', 'warning', 'info', 'debug'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function resolveConsoleLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(configured) ? (configured as LogLevel) : 'info';
}

// Read once at startup; LOG_LEVEL isn't expected to change at runtime.
const consoleLevel = resolveConsoleLevel();

function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(consoleLevel);
}

/**
 * Set the global MCP server instance for all loggers to use
 */
export function setLoggerServer(server: Server): void {
  globalMcpServer = server;
}

interface LoggerOptions {
  server?: Server;
}

/**
 * Logger class that uses MCP SDK for logging
 */
export class Logger {
  private context: string;
  private server: Server | null;

  constructor(context: string, options: LoggerOptions = {}) {
    this.context = context;
    this.server = options.server || globalMcpServer;
  }

  /**
   * Format data for logging
   */
  private formatData(message: string, data?: any): any {
    if (data === undefined) {
      return message;
    }
    
    try {
      // Handle various data types
      if (typeof data === 'string') {
        return `${message} ${data}`;
      } else if (data instanceof Error) {
        return `${message} ${data.message}\n${data.stack || ''}`;
      } else {
        return {
          message,
          data
        };
      }
    } catch (err) {
      return `${message} [Error formatting log data: ${err}]`;
    }
  }

  /**
   * Safely send a logging message to the connected MCP client, if any
   */
  private sendLogMessage(level: string, message: string, data?: any): void {
    if (!this.server) return;

    try {
      this.server.sendLoggingMessage({
        level: level as any,
        logger: this.context,
        data: this.formatData(message, data)
      }).catch(() => {
        // Silently ignore any errors
      });
    } catch {
      // Silently ignore any errors
    }
  }

  /**
   * Print the log line to stdout/stderr, so it shows up in process logs
   * (e.g. Railway) regardless of whether an MCP client is connected.
   */
  private logToConsole(level: LogLevel, message: string, data?: any): void {
    if (!isLevelEnabled(level)) return;

    const line = `[${level.toUpperCase()}] [${this.context}] ${message}`;
    const consoleFn = level === 'error' || level === 'warning' ? console.error : console.log;

    if (data === undefined) {
      consoleFn(line);
    } else {
      consoleFn(line, data);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, data?: any): void {
    this.logToConsole('error', message, data);
    this.sendLogMessage('error', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    this.logToConsole('warning', message, data);
    this.sendLogMessage('warning', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: any): void {
    this.logToConsole('info', message, data);
    this.sendLogMessage('info', message, data);
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    this.logToConsole('debug', message, data);
    this.sendLogMessage('debug', message, data);
  }
}

/**
 * Create a new logger with the given context
 */
export function createLogger(context: string, options: LoggerOptions = {}): Logger {
  return new Logger(context, options);
}
