// Monorepo wiring: shared/contract.ts (the one wire-shape source) is importable
// as '@shared/…'. The shared folder lives at ../shared on the Ubuntu host, but is
// mounted/synced INSIDE the app root ('./shared') in the grq-metro container and
// in the Mac build copy — resolve whichever exists.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

const sharedCandidates = [path.resolve(__dirname, 'shared'), path.resolve(__dirname, '..', 'shared')];
const shared = sharedCandidates.find((p) => fs.existsSync(p));
if (shared) {
  config.watchFolders = [shared];
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    '@shared': shared,
  };
  // shared/'s own imports (zod) always resolve from the app's node_modules,
  // wherever the shared folder physically lives.
  config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
}

module.exports = config;
