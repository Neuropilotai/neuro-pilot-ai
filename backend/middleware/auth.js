const jwt = require("jsonwebtoken");
const { SessionModel } = require("../db/database");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-this-in-production";
const JWT_EXPIRY = "7d";

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const session = await SessionModel.findByToken(token);

  if (!session) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  req.user = {
    id: session.userId,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    role: session.role,
  };

  next();
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    const session = await SessionModel.findByToken(token);
    if (session) {
      req.user = {
        id: session.userId,
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        role: session.role,
      };
    }
  }

  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  optionalAuth,
  requireRole,
  JWT_SECRET,
  JWT_EXPIRY,
};
