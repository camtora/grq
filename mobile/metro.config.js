// Monorepo wiring: shared/contract.ts (the one wire-shape source) is importable
// as '@shared/…'. The shared folder lives at ../shared on the Ubuntu host, but is
// mounted/synced INSIDE the app root ('./shared') in the grq-metro container and
// in the Mac build copy — resolve whichever exists.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Pick the candidate that actually CONTAINS the contract — on the host, ./shared can
// exist as the grq-metro container's (empty) mount target, which would shadow ../shared
// and break host-side bundling (bit the L5 export, 2026-07-04).
const sharedCandidates = [path.resolve(__dirname, 'shared'), path.resolve(__dirname, '..', 'shared')];
const shared = sharedCandidates.find((p) => fs.existsSync(path.join(p, 'contract.ts')));
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
