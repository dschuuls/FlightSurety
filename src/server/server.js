// import JSON files
const contractJson = require('../../build/contracts/FlightSuretyApp.json');
const config = require('./config.json')['localhost'];

// import node packages
const TruffleContract = require("@truffle/contract");
const WalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require('web3');

// setup some constants
const MNEMONIC = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
const NUM_ORACLES = 5;
const GAS_LIMIT = "200000";

// variables
let appContract;
let oracles = [];
let walletProvider;
let startingBlock = 0;
let web3;

start();

async function start() {
    await init();
    listenForOracleRequests();
}

async function init() {
    console.log('initializing ...\n');
    walletProvider = new WalletProvider(MNEMONIC, config.url, 0, 100);
    web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
    appContract = new web3.eth.Contract(contractJson.abi, config.appAddress);
    startingBlock = await getBlockNumber();
    await registerOracles();
}

function getRandomStatus() {
    let min = 0, max = 5;
    return Math.floor(Math.random() * (max - min + 1) + min) * 10;
}

async function getBlockNumber() {
    web3.eth.getBlockNumber((error, result) => {
        if (!error) return result;
        else return 0;
    });
}

async function registerOracles() {

    let adr = walletProvider.addresses;
    let fee = await appContract.methods.REGISTRATION_FEE().call({from: adr[0]});

    for (let i = 1; i <= NUM_ORACLES; i++) {

        let gas = "0";

        await appContract.methods.registerOracle().estimateGas({from: adr[i], value: fee})
            .then((gasAmount) => {
                gas = gasAmount;
                console.log('estimated gas:', gasAmount);
            })
            .catch((e) => { console.log('could not estimate gas'); });

        let registered = false;

        await appContract.methods.registerOracle().send({from: adr[i], value: fee, gas: GAS_LIMIT})
            .then((receipt) => {
                registered = true;
                console.log(`oracle #${i} registered, gas used: ${receipt.gasUsed}`);
            })
            .catch((e) => { console.log('could not register oracle #' + i); });

        if (!registered) continue;

        await appContract.methods.getMyIndexes().call({from: adr[i]})
            .then((result) => {
                console.log(`   indexes: ${result[0]}, ${result[1]}, ${result[2]}, address: ${adr[i]}`);
                oracles.push({address: adr[i], indexes: [result[0], result[1], result[2]]});
            })
            .catch((e) => { console.log('   could not get the indexes'); });
    }

    let failed = NUM_ORACLES - oracles.length;
    if (failed === 0) console.log(`\n${NUM_ORACLES} oracles registered successfully\n`);
    else console.log(`\n${failed} oracles failed to register, you might want to restart the server\n`);
}

function listenForOracleRequests() {
    appContract.events.OracleRequest({fromBlock: startingBlock})
        .on("connected", (subId) => {
            console.log(`listening for 'OracleRequest' events, subscription ID: ${subId}`);
        })
        .on('data', (event) => {
            let {index, airline, flight, timestamp} = event.returnValues;
            console.log('oracle request received:', index, airline, flight, timestamp);
            processOracleRequest(index, airline, flight, timestamp);
        })
        .on('error', (error, receipt) => {
            console.log('error:', error);
        });
}

function processOracleRequest(index, airline, flight, timestamp) {
    let matching = oracles.filter(oracle => { return oracle.indexes.includes(index); });
    console.log(`found ${matching.length} oracles with matching index`);
    matching.forEach(oracle => {
        submitOracleResponse(oracle.address, index, airline, flight, timestamp, getRandomStatus());
    });
}

async function submitOracleResponse(from, index, airline, flight, timestamp, statusCode) {
    let options = {from: from, gas: GAS_LIMIT};
    // let options = {from: from};
    console.log('sending response:', from, '=>', statusCode);
    await appContract.methods.submitOracleResponse(index, airline, flight, timestamp, statusCode).send(options)
        .catch((e) => { console.log('d\'oh, that failed'); });
}
