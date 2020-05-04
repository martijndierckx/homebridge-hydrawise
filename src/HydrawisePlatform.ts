/**
 * @author Martijn Dierckx
 */

import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, DEFAULT_POLLING_INTERVAL_CLOUD, DEFAULT_POLLING_INTERVAL_LOCAL } from './settings';
import { Hydrawise, HydrawiseConnectionType, HydrawiseZone } from 'hydrawise-api';
import { HydrawiseSprinkler } from './HydrawiseSprinkler';
import { setInterval } from "timers";

export class HydrawisePlatform implements DynamicPlatformPlugin {
  public readonly log: Logger;
  public readonly api: API;
  private hydrawise: Hydrawise;
  private pollingInterval: number;

  public accessories: PlatformAccessory[] = [];
  private sprinklers:HydrawiseSprinkler[] = [];

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    // Setup Hydrawise connection
    this.hydrawise = new Hydrawise({
      type : (config.type == 'LOCAL' ? HydrawiseConnectionType.LOCAL : HydrawiseConnectionType.CLOUD),
      host: config.host,
      user: config.user,
      password: config.password,
      key: config.api_key
    });

    // Set polling interval
    if(config.polling_interval !== undefined && typeof config.polling_interval == 'number') {
      this.pollingInterval = config.polling_interval;
    }
    else {
      if(this.hydrawise.type == HydrawiseConnectionType.LOCAL) {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_LOCAL;
      }
      else {
        this.pollingInterval = DEFAULT_POLLING_INTERVAL_CLOUD;
      }
    }

    // On: Finished loading Homebridge Plugin
    let that: HydrawisePlatform = this;
    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {

      // Continious updates of the zones
      setInterval(() => {
        that.getZones(that);
      }, that.pollingInterval);
    });
  }

  getZones(that: HydrawisePlatform): void {
    // List current sprinklers to be matched with Hydrawise zones
    let toCheckSprinklers: HydrawiseSprinkler[] = [...this.sprinklers];

    // Get zones from Hydrawise
    that.hydrawise.getZones().then((zones: HydrawiseZone[]) => {
      
      // Go over each configured zone in Hydrawise
      zones.map((zone: HydrawiseZone) => {
        
        // Find an existing sprinkler matching the zone
        let existingSprinkler = that.sprinklers.find(x => x.zone.relayID == zone.relayID);
        
        // Sprinkler already exists
        if(existingSprinkler !== undefined) {

          // Log
          that.log.debug('Received zone for existing sprinkler: '+ zone.name);
          
          // Update zone values & push to homebridge
          existingSprinkler.update(zone);

          // Remove from to-check list
          toCheckSprinklers = toCheckSprinklers.filter((item: HydrawiseSprinkler) => item.zone.relayID !== zone.relayID);
        }
        // Sprinker does not exist yet
        else {

          // Log
          that.log.debug('Received zone for new/cached sprinkler: '+ zone.name);

          // Create new sprinkler
          let newSprinkler = new HydrawiseSprinkler(zone, that);
          that.sprinklers.push(newSprinkler);
        }
      });

      // See if any zones have been removed from Hydrawise
      toCheckSprinklers.map(sprinkler => {

        // Log
        that.log.info("Removing Sprinkler for deleted Hydrawise zone: %s", sprinkler.zone.name);

        // Remove sprinkler
        sprinkler.unregister();
        that.sprinklers = that.sprinklers.filter((item: HydrawiseSprinkler) => item !== sprinkler);
      });
      
    })
    .catch(error => that.log.error(error));
  }

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info("Configuring Sprinkler from cache: %s", accessory.displayName);

    this.accessories.push(accessory);
  }
}