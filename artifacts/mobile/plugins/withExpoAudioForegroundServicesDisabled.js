const { withAndroidManifest } = require("expo/config-plugins");

const FOREGROUND_SERVICE_NAMES = [
  "expo.modules.audio.service.AudioControlsService",
  "expo.modules.audio.service.AudioRecordingService",
];

const FOREGROUND_SERVICE_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
];

function addRemovalDirective(elements, name) {
  const existing = elements.find((element) => element.$?.["android:name"] === name);
  if (existing) {
    existing.$["tools:node"] = "remove";
    return;
  }

  elements.push({
    $: {
      "android:name": name,
      "tools:node": "remove",
    },
  });
}

module.exports = function withExpoAudioForegroundServicesDisabled(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    manifest.$ ??= {};
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const application = Array.isArray(manifest.application)
      ? manifest.application[0]
      : manifest.application;
    if (!application) {
      throw new Error("Android manifest is missing its <application> element.");
    }
    application.service ??= [];
    manifest["uses-permission"] ??= [];

    for (const name of FOREGROUND_SERVICE_NAMES) {
      addRemovalDirective(application.service, name);
    }

    for (const name of FOREGROUND_SERVICE_PERMISSIONS) {
      addRemovalDirective(manifest["uses-permission"], name);
    }

    return configWithManifest;
  });
};
