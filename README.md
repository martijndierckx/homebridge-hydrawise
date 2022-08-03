# homebridge-hydrawise
[Hydrawise sprinkler system](https://hydrawise.com) plugin for [HomeBridge](https://github.com/nfarina/homebridge)

This repository contains the Hydrawise sprinkler system plugin for homebridge.

# Installation


1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-hydrawise
3. Update your configuration file. See sample-config.json snippet below. 

# Configuration

Configuration sample:

 ```
"platforms": [
		{
            "platform": "HydrawisePlatform",
            "name": "Hydrawise",
            "type": "CLOUD or LOCAL",
            "api_key": "YOUR API KEY",
            "host": "HOSTNAME OR IP OF LOCAL CONTROLLER",
            "password": "PASSWORD OF LOCAL CONTROLLER",
        }
	],

 ```

Fields: 

* **platform**: Must always be "HydrawisePlatform" (required)
* **name**: Can be anything (required)
* **type**: Should be either CLOUD or LOCAL depending on the type of connection you wish to make. When possible use a local connection to your controller since it's not rate limited (HTTP error 429) and suffers no delays when trying to run commands on zones. Local connections are only possible on firmware versions below v3.0.0 however.
* **api_key**: You can obtain your API key from the "Account Details" screen on the [Hydrawise platform](https://app.hydrawise.com/config/account/details) (required for CLOUD)
* **host**: The hostname or ip address of your local controller. (required for LOCAL)
* **user**: The username of your local controller. Should not be configured unless for specific setups. Defaults to 'admin'.
* **password**: The password of your local controller. Can be found in the settings of your controller. (required for LOCAL)
* **polling_interval**: Polling interval in miliseconds. Should only be configured if you run into frequent 429 errors on the CLOUD connection. Defaults to 1000ms for local connections and 12000ms for cloud connections.
  The default setting allows for 5 start/stop actions every 5 minutes on the cloud connection. If you require more, set the polling interval to 15000ms.
* **running_time**: The amount of seconds a zone should run (default: use configured run time on the Hydrawise platform)

# Notes
- The remaining running time will be displayed incorrectly if it's more than 1 hour. (Homekit limits it to 1 hour)