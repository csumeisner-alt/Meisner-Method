---
name: Native image shares with captions
description: Choosing a native sharing API when a mobile image must carry accompanying text.
---

**Rule:** For a native share that must send a local image and accompanying caption together, use a share API that accepts both a file URL and message; Expo Sharing's native API accepts the file but not caption text.

**Why:** Splitting the caption and image into separate share actions changes the user flow and does not reliably deliver both items to recipients.

**How to apply:** Include the image MIME type and concise message in one native share call, and verify the module is present in the device build; Expo Go may not include additional native modules.
