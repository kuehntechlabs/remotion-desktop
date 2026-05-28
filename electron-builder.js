// electron-builder configuration with conditional code signing.
//
// Signing turns on automatically when the relevant env vars are present:
//   - macOS:   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID  (notarisation)
//              CSC_LINK + CSC_KEY_PASSWORD                              (Developer ID cert)
//   - Windows: AZURE_TENANT_ID + AZURE_CLIENT_ID + AZURE_CLIENT_SECRET
//
// If a group is missing, that platform is built unsigned. Locally, values come
// from .env (loaded by scripts/build.js). In CI, they come from GitHub secrets
// mapped into the build step's env.
//
// Azure Trusted Signing account is fixed to "digital" in West Europe (von Poll
// Immobilien GmbH). Override via env vars only if you switch accounts.

const AZURE_ACCOUNT_NAME = process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME || "digital";
const AZURE_CERT_PROFILE = process.env.AZURE_CERT_PROFILE_NAME || "remotion-desktop";
const AZURE_ENDPOINT = process.env.AZURE_CODE_SIGNING_ENDPOINT || "https://weu.codesigning.azure.net/";

// Two ways to enable mac signing:
//   1. CSC_LINK + CSC_KEY_PASSWORD — point at a .p12 (used in CI from base64
//      secret; electron-builder imports into a temp keychain)
//   2. CSC_NAME — identity name already present in the user's login keychain
//      (used locally on macOS 26+, where temp-keychain imports split cert and
//      key across file-based and data-protection keychains and find-identity
//      can no longer resolve them)
const hasAppleSigning = Boolean(
  (process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD) ||
    process.env.CSC_NAME,
);
const hasAppleNotarization = Boolean(
  process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID,
);
const hasAzureSigning = Boolean(
  process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET,
);

const macConfig = {
  target: [
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ],
  icon: "build/icon.icns",
  artifactName: "RemotionDesktop.${ext}",
};

if (hasAppleSigning) {
  macConfig.hardenedRuntime = true;
  macConfig.gatekeeperAssess = false;
  macConfig.entitlements = "build/entitlements.mac.plist";
  macConfig.entitlementsInherit = "build/entitlements.mac.plist";
  macConfig.notarize = hasAppleNotarization;
}

const winConfig = {
  target: [{ target: "nsis", arch: ["x64"] }],
  icon: "build/icon.ico",
  artifactName: "RemotionDesktop.${ext}",
};

if (hasAzureSigning) {
  // publisherName is omitted on purpose — electron-builder will fall back to
  // the cert's Subject CN (the validated legal entity from Trusted Signing).
  winConfig.azureSignOptions = {
    endpoint: AZURE_ENDPOINT,
    codeSigningAccountName: AZURE_ACCOUNT_NAME,
    certificateProfileName: AZURE_CERT_PROFILE,
  };
}

if (!hasAppleSigning) {
  console.log(
    "[electron-builder] macOS: building unsigned (no CSC_LINK and no CSC_NAME)",
  );
} else if (!hasAppleNotarization) {
  console.log(
    "[electron-builder] macOS: signing without notarisation (APPLE_APP_SPECIFIC_PASSWORD missing)",
  );
} else {
  console.log("[electron-builder] macOS: signed + notarised");
}

if (!hasAzureSigning) {
  console.log(
    "[electron-builder] Windows: building unsigned (Azure secrets missing)",
  );
} else {
  console.log(
    `[electron-builder] Windows: signed via Trusted Signing (${AZURE_ACCOUNT_NAME}/${AZURE_CERT_PROFILE} @ ${AZURE_ENDPOINT})`,
  );
}

module.exports = {
  appId: "com.remotion.desktop",
  productName: "Remotion Desktop",
  files: ["dist/**/*", "dist-electron/**/*"],
  mac: macConfig,
  win: winConfig,
  publish: [
    {
      provider: "github",
      owner: "kuehntechlabs",
      repo: "remotion-desktop",
    },
  ],
};
