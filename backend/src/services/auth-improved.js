/**
 * Improved Authentication Service
 * 
 * Features:
 * 1. Encrypted password storage
 * 2. Auto-reauth when session expires
 * 3. MFA prompt on auth failure
 * 4. Secure credential management
 */

import crypto from 'crypto';
import db from '../db/index.js';
import logger from '../utils/logger.js';
import { loginGarmin, submitMFA, validateSession } from './garmin-sync.js';

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypt sensitive data (like passwords)
 */
function encrypt(text) {
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create key from encryption key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Return iv + authTag + encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedData) {
  try {
    // Split the data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create key from encryption key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Store encrypted credentials for user
 */
export async function storeEncryptedCredentials(email, password) {
  try {
    const encryptedPassword = encrypt(password);
    
    // Get or create user
    let user = await db('users').where({ garmin_email: email }).first();
    
    if (!user) {
      [user] = await db('users')
        .insert({
          garmin_email: email,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
    }
    
    // Store encrypted password in garth_session field
    await db('users')
      .where({ id: user.id })
      .update({
        garth_session: JSON.stringify({
          email: email,
          encrypted_password: encryptedPassword,
          stored_at: new Date().toISOString()
        }),
        updated_at: new Date()
      });
    
    logger.info(`Stored encrypted credentials for ${email}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to store credentials:', error);
    throw error;
  }
}

/**
 * Retrieve and decrypt stored credentials
 */
export async function getStoredCredentials(email) {
  try {
    const user = await db('users').where({ garmin_email: email }).first();
    
    if (!user || !user.garth_session) {
      return null;
    }
    
    let session;
    try {
      session = JSON.parse(user.garth_session);
    } catch {
      logger.error(`Invalid session data for ${email}`);
      return null;
    }
    
    if (!session.encrypted_password) {
      // Old format - plain text password
      if (session.password) {
        logger.warn(`User ${email} has plain text password - converting to encrypted`);
        await storeEncryptedCredentials(email, session.password);
        return { email: session.email, password: session.password };
      }
      return null;
    }
    
    // Decrypt password
    const password = decrypt(session.encrypted_password);
    
    return {
      email: session.email,
      password: password
    };
  } catch (error) {
    logger.error('Failed to retrieve credentials:', error);
    return null;
  }
}

/**
 * Attempt automatic re-authentication
 */
export async function attemptAutoReauth(email) {
  try {
    logger.info(`Attempting auto-reauth for ${email}`);
    
    // Get stored credentials
    const creds = await getStoredCredentials(email);
    
    if (!creds) {
      return {
        success: false,
        reason: 'no_stored_credentials',
        message: 'No stored credentials found. Please authenticate manually.',
        action_required: 'manual_login'
      };
    }
    
    // Attempt login
    try {
      const result = await loginGarmin(creds.email, creds.password);
      
      if (result.mfa_required) {
        return {
          success: false,
          reason: 'mfa_required',
          message: 'MFA code required for authentication',
          action_required: 'mfa_prompt',
          email: creds.email
        };
      }
      
      logger.info(`Auto-reauth successful for ${email}`);
      return {
        success: true,
        message: 'Re-authentication successful',
        username: result.username
      };
    } catch (authError) {
      logger.error(`Auto-reauth failed for ${email}:`, authError);
      
      // Check if it's an auth error or network error
      if (authError.message.includes('401') || authError.message.includes('Unauthorized')) {
        return {
          success: false,
          reason: 'invalid_credentials',
          message: 'Stored credentials are invalid. Please re-authenticate.',
          action_required: 'manual_login'
        };
      }
      
      return {
        success: false,
        reason: 'auth_error',
        message: authError.message,
        action_required: 'manual_login'
      };
    }
  } catch (error) {
    logger.error('Auto-reauth error:', error);
    return {
      success: false,
      reason: 'system_error',
      message: error.message,
      action_required: 'manual_login'
    };
  }
}

/**
 * Enhanced authentication with auto-storage
 */
export async function authenticateAndStore(email, password, mfaCode = null) {
  try {
    let result;
    
    if (mfaCode) {
      result = await submitMFA(email, password, mfaCode);
    } else {
      result = await loginGarmin(email, password);
      
      if (result.mfa_required) {
        return {
          success: false,
          mfa_required: true,
          email: email,
          message: 'MFA code required'
        };
      }
    }
    
    // Authentication successful - store encrypted credentials
    await storeEncryptedCredentials(email, password);
    
    return {
      success: true,
      username: result.username,
      message: 'Authentication successful and credentials stored securely'
    };
  } catch (error) {
    logger.error('Authentication failed:', error);
    throw error;
  }
}

/**
 * Wrapper for operations that may require re-auth
 */
export async function withAutoReauth(email, operation) {
  try {
    // Try the operation first
    return await operation();
  } catch (error) {
    // Check if it's an auth error
    if (error.message.includes('401') || 
        error.message.includes('Unauthorized') ||
        error.message.includes('authentication')) {
      
      logger.info(`Operation failed with auth error - attempting auto-reauth for ${email}`);
      
      // Attempt auto-reauth
      const reauthResult = await attemptAutoReauth(email);
      
      if (reauthResult.success) {
        // Retry the operation
        logger.info('Auto-reauth successful - retrying operation');
        return await operation();
      } else {
        // Auto-reauth failed - return the reauth result as error
        throw new Error(JSON.stringify(reauthResult));
      }
    }
    
    // Not an auth error - rethrow
    throw error;
  }
}

export default {
  encrypt,
  decrypt,
  storeEncryptedCredentials,
  getStoredCredentials,
  attemptAutoReauth,
  authenticateAndStore,
  withAutoReauth
};
