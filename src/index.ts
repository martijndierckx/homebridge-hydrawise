import type { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { HydrawisePlatform } from './HydrawisePlatform'; 

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform("homebridge-hydrawise", PLATFORM_NAME, HydrawisePlatform);
}
