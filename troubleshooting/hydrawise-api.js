/*
  If you run into issues, create an issue which contains the debug output of Homebridge ("homebridge -D") and the output of the following calls.
  PLEASE REMOVE YOUR API KEY/PASSWORD FROM THE OUTPUT BEFORE ADDING IT TO YOUR TICKET.
  
  Cloud connection:
  - Get Zones           -   node ./troubleshooting/hydrawise-api.js getZones YOUR_API_KEY
  - Get raw Schedule    -   node ./troubleshooting/hydrawise-api.js getSchedule YOUR_API_KEY

  Local connection:
  - Get Zones           -   node ./troubleshooting/hydrawise-api.js getZones IP_ADDRESS CONTROLLER_PASSWORD
  - Get raw Schedule    -   node ./troubleshooting/hydrawise-api.js getSchedule IP_ADDRESS CONTROLLER_PASSWORD

*/

const Hydrawise = require('hydrawise-api').Hydrawise;

// Setup connection
let hydrawise;
if(process.argv.length <= 4) {
  hydrawise = new Hydrawise({ type: 'CLOUD', key: process.argv[3] });
}
else {
  hydrawise = new Hydrawise({ type: 'LOCAL', host: process.argv[3], password: process.argv[4] });
}

// Get requested data
switch(process.argv[2].toLowerCase()) {
  case 'getzones':
    hydrawise.getZones().then(data => console.log(data)).catch(err => console.log(err));
    break;
  case 'getschedule':
    hydrawise.getStatusAndSchedule().then(data => console.log(data)).catch(err => console.log(err));
    break;
}