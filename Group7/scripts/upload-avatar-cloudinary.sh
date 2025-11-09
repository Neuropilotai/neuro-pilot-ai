#!/usr/bin/env bash
# Upload Lyra avatar to Cloudinary
# Get credentials from: https://cloudinary.com/users/register/free

if [ -z "$CLOUDINARY_CLOUD_NAME" ] || [ -z "$CLOUDINARY_UPLOAD_PRESET" ]; then
  echo "❌ Missing Cloudinary credentials"
  echo ""
  echo "Please set in .env:"
  echo "  CLOUDINARY_CLOUD_NAME=your_cloud_name"
  echo "  CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset"
  echo ""
  echo "Get them from: https://cloudinary.com/console"
  exit 1
fi

echo "🖼️  Uploading Lyra avatar to Cloudinary..."

RESPONSE=$(curl -s -X POST "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/image/upload" \
  -F "file=@assets/lyra-avatar.png" \
  -F "upload_preset=$CLOUDINARY_UPLOAD_PRESET" \
  -F "public_id=lyra7-avatar")

URL=$(echo "$RESPONSE" | grep -o '"secure_url":"[^"]*' | cut -d'"' -f4)

if [ -z "$URL" ]; then
  echo "❌ Upload failed"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Upload successful!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add to .env:"
echo "LYRA7_AVATAR_URL=$URL"
