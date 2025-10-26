/**
 * Google SSO Authentication
 *
 * OAuth 2.0 integration with Google for enterprise SSO
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { logger } = require('../config/logger');

/**
 * Configure Google OAuth strategy
 *
 * @param {Object} db - Database instance
 * @returns {passport.Strategy}
 */
function configureGoogleSSO(db) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = `${process.env.AUTH_CALLBACK_BASE_URL}/auth/callback/google`;

  if (!clientID || !clientSecret) {
    logger.warn('Google SSO: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return null;
  }

  const strategy = new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        logger.info('Google SSO: User authenticated', {
          email: profile.emails?.[0]?.value,
          sub: profile.id
        });

        // Extract user info from Google profile
        const email = profile.emails?.[0]?.value;
        const displayName = profile.displayName;
        const firstName = profile.name?.givenName;
        const lastName = profile.name?.familyName;
        const picture = profile.photos?.[0]?.value;

        if (!email) {
          logger.error('Google SSO: No email in profile', { profileId: profile.id });
          return done(new Error('No email address found in Google profile'));
        }

        // Look up user roles in database
        const userRoles = await db.all(`
          SELECT role, tenant_id, location_id
          FROM user_roles
          WHERE email = ? AND active = 1
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        `, [email]);

        // v15.5: HARDEN - Block login when no role mapping
        if (userRoles.length === 0) {
          logger.warn('Google SSO: User has no roles assigned - LOGIN DENIED', {
            email,
            provider: 'google',
            profile_id: profile.id
          });

          // Audit denied login
          try {
            await db.run(`
              INSERT INTO ai_audit_log (
                timestamp, user_email, user_role, tenant_id, action, entity, entity_id, success, error_message
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              new Date().toISOString(),
              email,
              null,
              process.env.TENANT_DEFAULT || 'neuropilot',
              'LOGIN',
              'user',
              email,
              0, // failed
              'No role mapping - access denied'
            ]);
          } catch (auditError) {
            logger.error('Google SSO: Failed to audit denied login', { error: auditError.message });
          }

          return done(null, false, {
            message: 'Access denied: No role assigned. Please contact your administrator to request access.'
          });
        }

        // Get primary tenant (first one)
        const primaryRole = userRoles[0];

        // Construct user object for JWT
        const user = {
          sub: profile.id,
          email,
          displayName,
          firstName,
          lastName,
          picture,
          roles: userRoles.map(r => r.role),
          tenant_id: primaryRole.tenant_id,
          location_id: primaryRole.location_id,
          provider: 'google',
          all_tenants: userRoles.map(r => ({
            tenant_id: r.tenant_id,
            location_id: r.location_id,
            role: r.role
          }))
        };

        // Record login in audit log
        try {
          await db.run(`
            INSERT INTO ai_audit_log (
              timestamp, user_email, user_role, tenant_id, action, entity, entity_id, success
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            new Date().toISOString(),
            email,
            primaryRole.role,
            primaryRole.tenant_id,
            'LOGIN',
            'user',
            email,
            1
          ]);
        } catch (auditError) {
          logger.error('Google SSO: Failed to record login audit', { error: auditError.message });
        }

        logger.info('Google SSO: User authorized', {
          email,
          roles: user.roles,
          tenant: user.tenant_id
        });

        return done(null, user);

      } catch (error) {
        logger.error('Google SSO: Authentication error', {
          error: error.message,
          stack: error.stack
        });
        return done(error);
      }
    }
  );

  passport.use('google', strategy);

  logger.info('Google SSO: Strategy configured', { callbackURL });
  return strategy;
}

/**
 * Get Google OAuth authorization URL
 */
function getAuthUrl() {
  return '/auth/google';
}

/**
 * Get Google OAuth callback URL
 */
function getCallbackUrl() {
  return '/auth/callback/google';
}

module.exports = {
  configureGoogleSSO,
  getAuthUrl,
  getCallbackUrl
};
