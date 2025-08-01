#!/bin/bash

echo "Preparing data for Fly.io transfer..."

# Create a tar archive of all data
cd /Users/davidmikulis/neuro-pilot-ai/backend
tar -czf data_bundle.tar.gz data/

echo "Transferring data bundle to Fly.io..."
# Copy the tar file
fly ssh console --app backend-silent-mountain-3362 -C "rm -rf /data/*" 
cat data_bundle.tar.gz | fly ssh console --app backend-silent-mountain-3362 -C "cd / && tar -xzf -"

echo "Cleaning up..."
rm data_bundle.tar.gz

echo "Restarting app to load new data..."
fly apps restart backend-silent-mountain-3362 --yes

echo "Waiting for app to restart..."
sleep 10

echo "Checking data status..."
curl -s "https://backend-silent-mountain-3362.fly.dev/health" | jq '.'