#!/usr/bin/env node

/**
 * Utility script to generate a bcrypt hash for a password
 * 
 * Usage:
 *   node generate-hash.js <password>
 * 
 * Example:
 *   node generate-hash.js mySecurePassword
 */

import bcrypt from 'bcryptjs';
import { formatBcryptPassword } from './password-utils.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Error: Password argument is required');
    console.error('Usage: node generate-hash.js <password>');
    process.exit(1);
  }
  
  const password = args[0];
  const rounds = parseInt(args[1] || '10', 10);
  
  try {
    console.log(`Generating bcrypt hash with ${rounds} rounds...`);
    const hash = await bcrypt.hash(password, rounds);
    console.log('\nHash:');
    console.log(hash);
    
    console.log('\nFor .env file:');
    console.log(`WEBDAV_PASSWORD=${formatBcryptPassword(hash)}`);
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

main();
