import bcrypt from 'bcryptjs';

/**
 * Get the plain text password from the environment variable value
 * 
 * Supports both plain text passwords and bcrypt hashed passwords in the format:
 * {bcrypt}$2y$05$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy
 * 
 * For bcrypt hashed passwords, we need to return the hash directly as it will be
 * compared with the server's bcrypt hash of the user's input.
 * 
 * @param passwordValue The password value from environment variable
 * @returns The processed password value
 */
export function processPassword(passwordValue: string): string {
    if (!passwordValue) {
        return '';
    }

    const bcryptPrefix = '{bcrypt}';
    
    // If the password starts with {bcrypt}, extract the hash
    if (passwordValue.startsWith(bcryptPrefix)) {
        return passwordValue.substring(bcryptPrefix.length);
    }
    
    // Otherwise, return as is (plain text)
    return passwordValue;
}

/**
 * Check if a password is a bcrypt hash
 * 
 * @param password The password to check
 * @returns True if the password appears to be a bcrypt hash
 */
export function isBcryptHash(password: string): boolean {
    return password.startsWith('$2a$') || 
           password.startsWith('$2b$') || 
           password.startsWith('$2y$');
}

/**
 * Verify a password against a plain text or bcrypt hashed reference
 * 
 * @param input The password input to verify
 * @param reference The reference password (plain text or bcrypt hash)
 * @returns True if the password matches
 */
export async function verifyPassword(input: string, reference: string): Promise<boolean> {
    // If the reference is a bcrypt hash, compare using bcrypt
    if (isBcryptHash(reference)) {
        return bcrypt.compare(input, reference);
    }
    
    // Otherwise, do a simple string comparison
    return input === reference;
}

/**
 * Generate a bcrypt hash for a password
 * 
 * @param password The password to hash
 * @param rounds The number of rounds for bcrypt (default: 10)
 * @returns The bcrypt hash
 */
export async function hashPassword(password: string, rounds: number = 10): Promise<string> {
    return bcrypt.hash(password, rounds);
}

/**
 * Format a password as a bcrypt hash with the {bcrypt} prefix
 * 
 * @param hash The bcrypt hash
 * @returns The formatted password string
 */
export function formatBcryptPassword(hash: string): string {
    return `{bcrypt}${hash}`;
}
