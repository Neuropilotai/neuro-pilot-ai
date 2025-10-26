/**
 * Microsoft SSO Authentication
 *
 * OAuth 2.0 integration with Microsoft Azure AD for enterprise SSO
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const { logger } = require('../config/logger');

/**
 * Configure Microsoft OAuth strategy
 *
 * @param {Object} db - Database instance
 * @returns {passport.Strategy}
 */
function configureMicrosoftSSO(db) {
  const clientID = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const callbackURL = `${process.env.AUTH_CALLBACK_BASE_URL}/auth/callback/microsoft`;

  if (!clientID || !clientSecret) {
    logger.warn('Microsoft SSO: Missing MS_CLIENT_ID or MS_CLIENT_SECRET');
    return null;
  }

  const strategy = new MicrosoftStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['user.read', 'email', 'profile', 'openid'],
      tenant: process.env.MS_TENANT_ID || 'common' // 'common', 'organizations', or specific tenant ID
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        logger.info('Microsoft SSO: User authenticated', {
          email: profile.emails?.[0]?.value,
          sub: profile.id
        });

        // Extract user info from Microsoft profile
        const email = profile.emails?.[0]?.value || profile.upn || profile.userPrincipalName;
        const displayName = profile.displayName;
        const firstName = profile.name?.givenName;
        const lastName = profile.name?.familyName;

        if (!email) {
          logger.error('Microsoft SSO: No email in profile', { profileId: profile.id });
          return done(new Error('No email address found in Microsoft profile'));
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
          logger.warn('Microsoft SSO: User has no roles assigned - LOGIN DENIED', {
            email,
            provider: 'microsoft',
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
            logger.error('Microsoft SSO: Failed to audit denied login', { error: auditError.message });
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
          roles: userRoles.map(r => r.role),
          tenant_id: primaryRole.tenant_id,
          location_id: primaryRole.location_id,
          provider: 'microsoft',
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
          logger.error('Microsoft SSO: Failed to record login audit', { error: auditError.message });
        }

        logger.info('Microsoft SSO: User authorized', {
          email,
          roles: user.roles,
          tenant: user.tenant_id
        });

        return done(null, user);

      } catch (error) {
        logger.error('Microsoft SSO: Authentication error', {
          error: error.message,
          stack: error.stack
        });
        return done(error);
      }
    }
  );

  passport.use('microsoft', strategy);

  logger.info('Microsoft SSO: Strategy configured', { callbackURL });
  return strategy;
}

/**
 * Get Microsoft OAuth authorization URL
 */
function getAuthUrl() {
  return '/auth/microsoft';
}

/**
 * Get Microsoft OAuth callback URL
 */
function getCallbackUrl() {
  return '/auth/callback/microsoft';
}

module.exports = {
  configureMicrosoftSSO,
  getAuthUrl,
  getCallbackUrl
};
