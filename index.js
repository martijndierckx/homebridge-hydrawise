const Hydrawise = require('hydrawise-api');
var HydrawiseDevice = require('./lib/device.js');
var Service, Characteristic, Accessory, uuid;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;
	uuid = homebridge.hap.uuid;

	homebridge.registerPlatform("homebridge-hydrawise", "Hydrawise", HydrawisePlatform);
};

function HydrawisePlatform(log, config) {
	this.log = log;
	this.debug = log.debug;
	this.config = config;
	this.clientConfig = {
		api_key: config.api_key,
		//controller_id: config.controller_id
	};
};

HydrawisePlatform.prototype = {

	accessories: function (callback) {

		var that = this;

		const hw = Hydrawise(this.clientConfig.api_key);
		//hw.setcontroller(this.clientConfig.controller_id);

		hw.statusschedule(/*this.clientConfig.controller_id*/)
			.then(function(data) {
				that.zones = [];

				data.relays.map(function (z, i) {

					var acc = new Accessory(z.name, uuid.generate(that.config.controller_id + z.relay_id));
					acc.getServices = function(){
						return acc.services;
					};
					acc.name = z.name;

					acc.getService(Service.AccessoryInformation)
						.setCharacteristic(Characteristic.Manufacturer, "Hydrawise")
						.setCharacteristic(Characteristic.Model, "Hydrawise")
						.setCharacteristic(Characteristic.SerialNumber, z.relay_id);

					var service = acc.addService(Service.Valve);
					service.setCharacteristic(Characteristic.ValveType, "1");

					var getZoneStatus = function() {
						hw.statusschedule(that.clientConfig.controller_id)
							.then(function(data) {
								var values = {
									RemainingDuration: 0,
									InUse: false,
									Active: false,
									ProgramMode: 1
								};

								// Check if running
								if(data.running !== undefined) {
									var zone = data.running.find(function(x) {
										return x.relay_id == z.relay_id;
									});
									if(zone != undefined && zone != null) {
										values.RemainingDuration = zone.time_left;
										values.Active = true;
										values.InUse = true;
									}
								}

								//Check if suspended
								var zone = data.relays.find(function(x) {
									return x.relay_id === z.relay_id;
								});
								if(zone.suspended !== undefined && zone.suspended == 1) {
									values.ProgramMode = 0;
								}

								service.getCharacteristic(Characteristic.Active).updateValue(values.Active);
								service.getCharacteristic(Characteristic.InUse).updateValue(values.InUse);
								service.getCharacteristic(Characteristic.RemainingDuration).updateValue(values.RemainingDuration);
								//service.getCharacteristic(Characteristic.SetDuration).updateValue(values.SetDuration);
								//service.getCharacteristic(Characteristic.ProgramMode).updateValue(values.ProgramMode);
							});
					};

					// Update every 5 seconds, even without homekit asking
					setInterval(getZoneStatus, 5000);

					/*service.getCharacteristic(Characteristic.ProgramMode)
						.on('get', function (callback) {
							getZoneStatus(z);
						});*/

					service.getCharacteristic(Characteristic.Active)
						.on('get', function (callback) {
							getZoneStatus();
							callback();
						})
						.on('set', function (state, callback) {
							if(state == 1) {
								hw.setzone('run', {period_id: '123', custom: z.run_seconds+'', relay_id: z.relay_id})
									.then(function(data) {
										callback(null, state);

										// Starting usually takes a couple of seconds
										setTimeout(getZoneStatus, 10000);
									});	
							}
							else {
								hw.setzone('stop', {relay_id: z.relay_id})
									.then(function(data) {
										callback(null, state);

										// Stopping usually takes a couple of seconds
										setTimeout(getZoneStatus, 10000);
									});
							}
						});

					/*service.getCharacteristic(Characteristic.SetDuration)
						.on('set', function (duration, callback) {
							if(duration > 0) {
								hw.setzone('run', {period_id: '123', custom: duration+'', relay_id: z.relay_id})
									.then(function(data) {
										callback(null, duration);

										// Starting usually takes a couple of seconds
										setTimeout(getZoneStatus, 10000);
									});
							}	
						});*/

					service.getCharacteristic(Characteristic.InUse)
						.on('get', function (callback) {
							getZoneStatus();
							callback();
						});

					service.getCharacteristic(Characteristic.RemainingDuration)
						.on('get', function (callback) {
							getZoneStatus();
							callback();
						});


					acc.refreshOn = function () {
						getZoneStatus();
					};

					that.zones.push(acc);
				});

				callback(that.zones);
			})
			.catch(error => that.log(error));
	}
};