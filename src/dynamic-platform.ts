import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
} from "homebridge";
import { 
  Hydrawise,
  HydrawiseConnectionType,
  HydrawiseZone,
  HydrawiseController,
  HydrawiseCommandException } from "hydrawise-api";  
import { setInterval } from "timers";

const PLUGIN_NAME = "homebridge-hydrawise";
const PLATFORM_NAME = "HydrawisePlatform";

let hap: HAP;
let Accessory: typeof PlatformAccessory;

export = (api: API) => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLATFORM_NAME, HydrawisePlatform);
};

class HydrawisePlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private didFinishLoading: Boolean;
  private hydrawise: Hydrawise;

  private readonly accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.didFinishLoading = false;

    this.hydrawise = new Hydrawise({
      type : (config.type == 'LOCAL' ? HydrawiseConnectionType.LOCAL : HydrawiseConnectionType.CLOUD),
      host: config.host,
      user: config.user,
      password: config.password
    });

    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.didFinishLoading = true;
    });
  }

  getZones(): void {
    let that: HydrawisePlatform = this;
    this.hydrawise.getZones().then((zones: HydrawiseZone[]) => {

      that.log('got new zones list');
      
      // Go over each received zone
      zones.map((zone: HydrawiseZone) => {
        
        

      
      });
    })
    .catch(error => that.log(error));
  }

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log("Configuring accessory %s", accessory.displayName);

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log("%s identified!", accessory.displayName);
    });

    accessory.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.log.info("%s Light was set to: " + value);
        callback();
      });

    this.accessories.push(accessory);
  }

  // --------------------------- CUSTOM METHODS ---------------------------

  addAccessory(name: string) {
    this.log.info("Adding new accessory with name %s", name);

    // uuid must be generated from a unique but not changing data source, name should not be used in the most cases. But works in this specific example.
    const uuid = hap.uuid.generate(name);
    const accessory = new Accessory(name, uuid);

    accessory.addService(hap.Service.Lightbulb, "Test Light");

    this.configureAccessory(accessory); // abusing the configureAccessory here

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  removeAccessories() {
    // we don't have any special identifiers, we just remove all our accessories

    this.log.info("Removing all accessories");

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories);
    this.accessories.splice(0, this.accessories.length); // clear out the array
  }

  /*private handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (request.url === "/add") {
      this.addAccessory(new Date().toISOString());
    } else if (request.url === "/remove") {
      this.removeAccessories();
    }

    response.writeHead(204); // 204 No content
    response.end();
  }*/

  // ----------------------------------------------------------------------

}
