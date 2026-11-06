import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appDirectory = new URL("../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const notificationsPlugin = config.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications",
);

test("Android notifications use a transparent monochrome Meisner logo glyph", () => {
  assert.ok(notificationsPlugin, "Expo notifications plugin must be configured");
  assert.equal(notificationsPlugin[1].icon, "./assets/images/notification-icon.png");
  assert.equal(notificationsPlugin[1].color, "#D99A22");

  const iconPath = resolve(appDirectory.pathname, notificationsPlugin[1].icon);
  const png = readFileSync(iconPath);
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", "icon must be a PNG");
  assert.equal(png.readUInt32BE(16), 96, "notification icon width must be 96px");
  assert.equal(png.readUInt32BE(20), 96, "notification icon height must be 96px");
  assert.equal(png[25], 6, "notification icon must include an alpha channel");
});
