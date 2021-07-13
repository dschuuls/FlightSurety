const FlightSuretyApp = artifacts.require("FlightSuretyApp");
const FlightSuretyData = artifacts.require("FlightSuretyData");
const fs = require('fs');

module.exports = function (deployer, networks, accounts) {

    let owner = accounts[0]; // '0x627306090abaB3A6e1400e9345bC60c78a8BEf57';
    let firstAirline = accounts[1]; // '0xf17f52151EbEF6C7334FAD080c5704D77216b732';

    deployer.deploy(FlightSuretyData)
        .then(() => {
            return deployer.deploy(FlightSuretyApp, FlightSuretyData.address)
                .then(async () => {
                    let config = {
                        localhost: {
                            url: 'http://localhost:8545',
                            dataAddress: FlightSuretyData.address,
                            appAddress: FlightSuretyApp.address
                        }
                    }
                    fs.writeFileSync(__dirname + '/../src/dapp/config.json', JSON.stringify(config, null, '\t'), 'utf-8');
                    fs.writeFileSync(__dirname + '/../src/server/config.json', JSON.stringify(config, null, '\t'), 'utf-8');

                    // making sure the app contract is being authorized in the data contract
                    let dataInstance = await FlightSuretyData.at(FlightSuretyData.address);
                    await dataInstance.authorizeCaller(FlightSuretyApp.address, {from: owner});
                    console.log(`authorizeCaller():\nAuthorized FlightSuretyApp (${FlightSuretyApp.address}) to use FlightSuretyData (${FlightSuretyData.address})`);

                    // adding the default account as the very first airline, called EthAir ;)
                    let appInstance = await FlightSuretyApp.at(FlightSuretyApp.address);
                    await appInstance.registerAirline(firstAirline, 'EthAir', {from: owner});
                    console.log(`\nregisterAirline():\nRegistered accounts[1] (${firstAirline}) as the first airline, called 'EthAir' ;)`);
                });
        });
}
