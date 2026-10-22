const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Le contrat des invitations est partagé avec le site, dans ../src/lib.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "../src/lib")];
module.exports = config;
