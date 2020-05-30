/*
  If you run into issues, create an issue which contains the debug output of Homebridge ("homebridge -D") and the output of the following calls.
  PLEASE REMOVE YOUR API KEY/PASSWORD FROM THE OUTPUT BEFORE ADDING IT TO YOUR TICKET.
  
  Cloud connection:
  - Get Zones                          -   node ./troubleshooting/hydrawise-api.js CLOUD getZones YOUR_API_KEY
  - Get Zones for Controller           -   node ./troubleshooting/hydrawise-api.js CLOUD getZones YOUR_API_KEY CONTROLLER_ID
  - Get Raw Schedule                   -   node ./troubleshooting/hydrawise-api.js CLOUD getSchedule YOUR_API_KEY
  - Get Raw Schedule for Controller    -   node ./troubleshooting/hydrawise-api.js CLOUD getSchedule YOUR_API_KEY CONTROLLER_ID
  - Get Controllers                    -   node ./troubleshooting/hydrawise-api.js CLOUD getControllers YOUR_API_KEY

  Local connection:
  - Get Zones                          -   node ./troubleshooting/hydrawise-api.js LOCAL getZones IP_ADDRESS CONTROLLER_PASSWORD
  - Get Raw Schedule                   -   node ./troubleshooting/hydrawise-api.js LOCAL getSchedule IP_ADDRESS CONTROLLER_PASSWORD

*/

const Hydrawise = require('hydrawise-api').Hydrawise;

// Setup connection
let hydrawise;
if(process.argv[2].toUpperCase() == 'CLOUD') {
  hydrawise = new Hydrawise({ type: 'CLOUD', key: process.argv[4] });
}
else {
  hydrawise = new Hydrawise({ type: 'LOCAL', host: process.argv[4], password: process.argv[5] });
}

// Get requested data
switch(process.argv[3].toLowerCase()) {
  case 'getzones':
    if(process.argv[2].toUpperCase() == 'CLOUD' && process.argv[5] !== undefined && process.argv[5] !== null) {
      hydrawise.getZones(parseInt(process.argv[5])).then(data => console.log(data)).catch(err => console.log(err));
    }
    else {
      hydrawise.getZones().then(data => console.log(data)).catch(err => console.log(err));
    }
    break;

  case 'getschedule':
    if(process.argv[2].toUpperCase() == 'CLOUD' && process.argv[5] !== undefined && process.argv[5] !== null) {
      hydrawise.getStatusAndSchedule(parseInt(process.argv[5])).then(data => console.log(data)).catch(err => console.log(err));
    }
    else {
      hydrawise.getStatusAndSchedule().then(data => console.log(data)).catch(err => console.log(err));
    }  
    break;

  case 'getcontrollers':
    hydrawise.getControllers().then(data => console.log(data)).catch(err => console.log(err));
    break;
}