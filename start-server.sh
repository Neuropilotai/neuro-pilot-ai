#!/bin/bash

# Start the inventory server with admin bootstrap
export PORT=8083
export ALLOWED_ORIGINS="http://localhost:5500"
export JWT_SECRET=$(openssl rand -hex 32)
export LOGIN_MAX=20

# One-time admin bootstrap - change these credentials!
export ADMIN_BOOTSTRAP_EMAIL="admin@secure-inventory.dev"
export ADMIN_BOOTSTRAP_PASSWORD="SecurePass123!"

echo "Starting inventory server on port $PORT"
echo "Admin bootstrap email: $ADMIN_BOOTSTRAP_EMAIL"
echo "Make sure to change the default password!"

cd backend
node inventory-complete-bilingual.js