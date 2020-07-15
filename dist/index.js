"use strict";
const settings_1 = require("./settings");
const HydrawisePlatform_1 = require("./HydrawisePlatform");
module.exports = (api) => {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, HydrawisePlatform_1.HydrawisePlatform);
};
//# sourceMappingURL=index.js.map