{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "image",
              "src": "{{AVATAR_URL}}"
            },
            "start": 0,
            "length": 2.0,
            "fit": "cover",
            "scale": 1.0,
            "opacity": 1,
            "transition": {
              "in": "fade",
              "out": "fade"
            },
            "effect": "zoomIn",
            "position": "center"
          },
          {
            "asset": {
              "type": "video",
              "src": "{{VIDEO_URL}}"
            },
            "start": 0,
            "length": "{{VIDEO_LENGTH}}",
            "fit": "cover",
            "scale": 1,
            "position": "center"
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "title",
              "text": "{{TITLE_TEXT}}",
              "style": "minimal"
            },
            "start": 0,
            "length": "{{TITLE_LENGTH}}",
            "position": "center"
          }
        ]
      }
    ]
  }
}
---
import fs from "fs";
import path from "path";

export async function renderShotstack(payload, options = {}) {
  const templatePath = path.resolve(
    process.cwd(),
    "config",
    "shotstack_template.json"
  );
  let templateStr = fs.readFileSync(templatePath, "utf8");

  // Existing placeholder replacements
  templateStr = templateStr.replaceAll("{{HOOK_TEXT}}", payload.hookText);
  templateStr = templateStr.replaceAll("{{CTA_TEXT}}", payload.ctaText);
  templateStr = templateStr.replaceAll("{{VIDEO_URL}}", payload.videoUrl);
  templateStr = templateStr.replaceAll("{{VIDEO_LENGTH}}", String(payload.videoLength));
  templateStr = templateStr.replaceAll("{{TITLE_TEXT}}", payload.titleText);
  templateStr = templateStr.replaceAll("{{TITLE_LENGTH}}", String(payload.titleLength));

  // Avatar URL (Lyra7 or per-agent)
  const resolvedAvatarUrl =
    (options && options.avatarUrl) ||
    process.env.LYRA7_AVATAR_URL ||
    "";
  templateStr = templateStr.replaceAll("{{AVATAR_URL}}", resolvedAvatarUrl);

  const templateJson = JSON.parse(templateStr);
  // ... existing rendering logic ...
  // (Assuming sending templateJson to Shotstack API or similar)
  return templateJson;
}
---
import { renderShotstack } from "../scripts/shotstack-render.mjs";

export async function runOneShotstack(agent) {
  const shotstackPayload = {
    hookText: "Welcome to Group7",
    ctaText: "Subscribe now!",
    videoUrl: "https://example.com/video.mp4",
    videoLength: 10,
    titleText: "Group7 Video",
    titleLength: 3,
  };

  // Pass agent in options for avatar URL resolution
  await renderShotstack(shotstackPayload, { agent });
}
