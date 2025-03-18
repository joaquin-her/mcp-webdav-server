import { 
    processPassword, 
    isBcryptHash, 
    verifyPassword, 
    hashPassword,
    formatBcryptPassword
} from '../utils/password-utils.js';
import bcrypt from 'bcryptjs';

describe('Password Utilities', () => {
    describe('processPassword', () => {
        it('should return empty string for falsy values', () => {
            expect(processPassword('')).toBe('');
            expect(processPassword(undefined as unknown as string)).toBe('');
        });

        it('should extract the hash from bcrypt-prefixed passwords', () => {
            const hash = '$2y$05$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy';
            const input = `{bcrypt}${hash}`;
            expect(processPassword(input)).toBe(hash);
        });

        it('should return plaintext passwords as-is', () => {
            const plain = 'mySecurePassword123';
            expect(processPassword(plain)).toBe(plain);
        });
    });

    describe('isBcryptHash', () => {
        it('should identify valid bcrypt hashes', () => {
            expect(isBcryptHash('$2a$10$abcdefghijklmnopqrstuv')).toBe(true);
            expect(isBcryptHash('$2b$10$abcdefghijklmnopqrstuv')).toBe(true);
            expect(isBcryptHash('$2y$10$abcdefghijklmnopqrstuv')).toBe(true);
        });

        it('should return false for non-bcrypt values', () => {
            expect(isBcryptHash('plaintext')).toBe(false);
            expect(isBcryptHash('{bcrypt}$2y$10$abcdefg')).toBe(false);
            expect(isBcryptHash('$1$abcdefg')).toBe(false); // MD5 hash format
        });
    });

    describe('verifyPassword', () => {
        it('should compare plaintext passwords directly', async () => {
            expect(await verifyPassword('secret', 'secret')).toBe(true);
            expect(await verifyPassword('secret', 'wrong')).toBe(false);
        });

        it('should verify against bcrypt hashes', async () => {
            // Create a hash with a known password
            const password = 'testPassword123';
            const hash = await bcrypt.hash(password, 5);
            
            expect(await verifyPassword(password, hash)).toBe(true);
            expect(await verifyPassword('wrongPassword', hash)).toBe(false);
        });
    });

    describe('hashPassword', () => {
        it('should generate a valid bcrypt hash', async () => {
            const password = 'mySecurePassword';
            const hash = await hashPassword(password, 5); // Use low rounds for test speed
            
            // The hash should be a bcrypt hash
            expect(isBcryptHash(hash)).toBe(true);
            
            // We should be able to verify the password against it
            expect(await bcrypt.compare(password, hash)).toBe(true);
        });
    });

    describe('formatBcryptPassword', () => {
        it('should format a hash with the {bcrypt} prefix', () => {
            const hash = '$2y$05$CyLKnUwn9fqqKQFEbxpZFuE9mzWR/x8t6TE7.CgAN0oT8I/5jKJBy';
            expect(formatBcryptPassword(hash)).toBe(`{bcrypt}${hash}`);
        });
    });
});
