const crypto = require('crypto');
const { logger } = require('../config/logger');

// Store for device bindings (in production, use database)
const deviceBindings = new Map();

// Owner's MacBook Pro device fingerprint (will be set on first login)
let ownerDeviceFingerprint = null;

/**
 * Generate a stable device fingerprint from request headers
 * Uses hardware/software identifiers that don't change
 */
const generateDeviceFingerprint = (req) => {
  const components = [
    req.get('user-agent') || '',
    req.get('accept-language') || '',
    req.get('accept-encoding') || '',
    req.get('accept') || '',
    // Include client IP for additional security
    req.ip || req.connection.remoteAddress || ''
  ];

  const fingerprint = crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex');

  return fingerprint;
};

/**
 * Bind a device to a user account
 */
const bindDevice = (userId, deviceFingerprint, metadata = {}) => {
  const binding = {
    userId,
    deviceFingerprint,
    boundAt: new Date().toISOString(),
    metadata: {
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      ...metadata
    }
  };

  deviceBindings.set(userId, binding);

  logger.info('Device bound to account', {
    userId,
    fingerprint: deviceFingerprint.substring(0, 16) + '...',
    ip: metadata.ip
  });

  return binding;
};

/**
 * Bind the owner's MacBook Pro (one-time setup)
 */
const bindOwnerDevice = (req) => {
  const fingerprint = generateDeviceFingerprint(req);

  if (!ownerDeviceFingerprint) {
    ownerDeviceFingerprint = fingerprint;

    bindDevice('admin-1', fingerprint, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
      deviceType: 'MacBook Pro',
      boundBy: 'owner',
      permanent: true
    });

    logger.warn('OWNER DEVICE BOUND - This should only happen once!', {
      fingerprint: fingerprint.substring(0, 16) + '...',
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    return { success: true, fingerprint, message: 'Owner device bound successfully' };
  }

  return { success: false, message: 'Owner device already bound' };
};

/**
 * Verify device binding for owner account
 */
const verifyOwnerDevice = (req) => {
  const currentFingerprint = generateDeviceFingerprint(req);

  // If owner device not yet bound, reject
  if (!ownerDeviceFingerprint) {
    logger.error('Owner device not bound - device binding required', {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    return {
      verified: false,
      reason: 'DEVICE_NOT_BOUND',
      message: 'Owner device must be bound first. Contact system administrator.'
    };
  }

  // Check if current device matches owner's MacBook Pro
  if (currentFingerprint !== ownerDeviceFingerprint) {
    logger.error('SECURITY ALERT: Unauthorized device attempt to access owner account', {
      expectedFingerprint: ownerDeviceFingerprint.substring(0, 16) + '...',
      receivedFingerprint: currentFingerprint.substring(0, 16) + '...',
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    return {
      verified: false,
      reason: 'DEVICE_MISMATCH',
      message: 'This device is not authorized for owner access. Owner account can only be accessed from the registered MacBook Pro.'
    };
  }

  return {
    verified: true,
    fingerprint: currentFingerprint
  };
};

/**
 * Middleware to enforce device binding for owner routes
 * Railway Production: Checks X-Owner-Device header against OWNER_DEVICE_ID env var
 */
const requireOwnerDevice = (req, res, next) => {
  // Only apply to owner/admin users
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'owner')) {
    return next();
  }

  // Railway Production: Check X-Owner-Device header against OWNER_DEVICE_ID
  const expectedDeviceId = process.env.OWNER_DEVICE_ID;
  const providedDeviceId = req.headers['x-owner-device'] || req.headers['X-Owner-Device'];

  if (!expectedDeviceId) {
    logger.error('OWNER_DEVICE_ID not configured - owner routes disabled for security', {
      userId: req.user.id,
      ip: req.ip,
      endpoint: req.path
    });

    return res.status(500).json({
      error: 'Owner device authentication not configured',
      code: 'DEVICE_ID_NOT_CONFIGURED',
      security: 'CONFIGURATION_ERROR'
    });
  }

  if (!providedDeviceId) {
    logger.warn('Owner route accessed without X-Owner-Device header', {
      userId: req.user.id,
      ip: req.ip,
      endpoint: req.path
    });

    return res.status(401).json({
      error: 'X-Owner-Device header required',
      code: 'DEVICE_HEADER_MISSING',
      security: 'DEVICE_BINDING_ENFORCED'
    });
  }

  if (providedDeviceId !== expectedDeviceId) {
    logger.warn('Owner device ID mismatch - unauthorized access attempt', {
      userId: req.user.id,
      ip: req.ip,
      endpoint: req.path,
      providedDeviceId: providedDeviceId.substring(0, 8) + '...' // Log partial for security
    });

    return res.status(403).json({
      error: 'Invalid owner device ID',
      code: 'DEVICE_ID_MISMATCH',
      security: 'DEVICE_BINDING_ENFORCED'
    });
  }

  // Device verified, proceed
  req.deviceVerified = true;
  req.deviceId = providedDeviceId;
  next();
};

/**
 * Get device binding status
 */
const getDeviceBindingStatus = () => {
  return {
    ownerDeviceBound: !!ownerDeviceFingerprint,
    ownerFingerprint: ownerDeviceFingerprint ? ownerDeviceFingerprint.substring(0, 16) + '...' : null,
    totalBindings: deviceBindings.size,
    bindings: Array.from(deviceBindings.values()).map(b => ({
      userId: b.userId,
      boundAt: b.boundAt,
      deviceType: b.metadata.deviceType,
      fingerprintPreview: b.deviceFingerprint.substring(0, 16) + '...'
    }))
  };
};

/**
 * Unbind owner device (emergency only - requires confirmation)
 */
const unbindOwnerDevice = (confirmationCode) => {
  const expectedCode = crypto
    .createHash('sha256')
    .update('UNBIND_OWNER_DEVICE_EMERGENCY')
    .digest('hex')
    .substring(0, 16);

  if (confirmationCode !== expectedCode) {
    logger.error('Failed attempt to unbind owner device - invalid confirmation code');
    return { success: false, error: 'Invalid confirmation code' };
  }

  const previousFingerprint = ownerDeviceFingerprint;
  ownerDeviceFingerprint = null;
  deviceBindings.delete('admin-1');

  logger.warn('OWNER DEVICE UNBOUND - Emergency unbind executed', {
    previousFingerprint: previousFingerprint ? previousFingerprint.substring(0, 16) + '...' : null
  });

  return {
    success: true,
    message: 'Owner device unbound. Next owner login will bind the new device.',
    previousFingerprint: previousFingerprint ? previousFingerprint.substring(0, 16) + '...' : null
  };
};

module.exports = {
  generateDeviceFingerprint,
  bindDevice,
  bindOwnerDevice,
  verifyOwnerDevice,
  requireOwnerDevice,
  getDeviceBindingStatus,
  unbindOwnerDevice
};
