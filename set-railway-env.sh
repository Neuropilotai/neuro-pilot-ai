#!/bin/bash

# Script to set all environment variables from .env.deployment to Railway

echo "🚀 Setting Railway environment variables from .env.deployment..."

# Read .env.deployment and set each variable
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  if [[ ! "$key" =~ ^#.*$ ]] && [[ -n "$key" ]]; then
    # Remove any surrounding quotes from value
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    
    echo "Setting $key..."
    railway variables set "$key=$value" || echo "Failed to set $key"
  fi
done < .env.deployment

echo "✅ Environment variables updated!"
echo ""
echo "🔄 Triggering new deployment..."
railway up --detach

echo ""
echo "✅ COMPLETE! Your Railway deployment should now have all environment variables."
echo "Check your deployment at: https://resourceful-achievement-production.up.railway.app/"