#!/bin/bash

# Script to upload template files to GitHub repository

echo "📤 Uploading GFS Orders Template to GitHub..."

# Clone your repository
cd ~/Desktop
git clone https://github.com/Neuropilotai/gfs-orders-data.git
cd gfs-orders-data

# Copy the template files
cp -r /Users/davidmikulis/neuro-pilot-ai/backend/gfs-orders-repo-template/* .

# Add, commit and push
git add .
git commit -m "Add initial order structure and sample order"
git push origin main

echo "✅ Upload complete! Check your repository at:"
echo "https://github.com/Neuropilotai/gfs-orders-data"