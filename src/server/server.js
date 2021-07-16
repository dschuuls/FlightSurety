// import node packages
const TruffleContract = require("@truffle/contract");
const WalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require('web3');

// import JSON files
const contractJson = require('../../build/contracts/FlightSuretyApp.json');
const config = require('./config.json')['localhost'];

// setup some constants
const FORCE_LATE_AIRLINE = false;
const MNEMONIC = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
const NUM_ORACLES = 99;

// variables
let app;
let truffleContract;
let web3ethContract;
let walletProvider;
let oracles = [];
let block = 0;
let web3;

start();

async function start() {
    await init();
    listenForOracleRequests();
    listenForFlightStatusInfo();
}

async function init() {

    console.log('initializing ...');

    walletProvider = new WalletProvider(MNEMONIC, config.url, 0, 100);

    let websocketProvider = new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws'));
    web3 = new Web3(websocketProvider);
    web3ethContract = new web3.eth.Contract(contractJson.abi, config.appAddress);

    let httpProvider = new Web3.providers.HttpProvider(config.url);
    truffleContract = TruffleContract(contractJson);
    truffleContract.setProvider(httpProvider);

    app = await truffleContract.deployed();

    block = await getBlockNumber();

    await registerOracles();
}

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function getBlockNumber() {
    web3.eth.getBlockNumber((error, result) => {
        if (!error) return result;
        else return 0;
    });
}

async function registerOracles() {

    let adr = walletProvider.addresses;
    let fee = await app.REGISTRATION_FEE();

    for (let i = 1; i <= NUM_ORACLES; i++) {

        let registered = false;

        // this is strange: invoking registerOracle() often results in the transactions to be
        // reverted. this was first noticed when it happened in the oracle tests. it seems to
        // get better when ganache-cli is left unused for a couple of minutes: when ganache-cli
        // is started and time passes between deploying the contracts and starting the server,
        // the reverted transactions are far less.
        // this needs further investigation. for now here is a do ... while as a work-around.
        do {
            await app.registerOracle({from: adr[i], value: fee, gas: '200000'})
                .then((result) => {
                    registered = true;
                    console.log(`oracle #${i} registered, gas used: ${result.receipt.gasUsed}`);
                })
                .catch((e) => {
                    console.log(`tx revert, couldn't register oracle #${i}, will retry...`);
                });
        } while (!registered);

        await app.getMyIndexes({from: adr[i]})
            .then((result) => {
                let indexes = [
                    parseInt(result[0].toString()),
                    parseInt(result[1].toString()),
                    parseInt(result[2].toString())
                ];
                let newOracle = {address: adr[i], indexes: indexes};
                oracles.push(newOracle);
                console.log(newOracle);
            })
            .catch((e) => {
                console.log('   could not get the indexes');
            });
    }
}

function listenForOracleRequests() {
    web3ethContract.events.OracleRequest({fromBlock: block})
        .on("connected", (subId) => {
            console.log(`listening for 'OracleRequest' events, subscription ID: ${subId}`);
        })
        .on('data', (event) => {
            let {index, airline, flight, timestamp} = event.returnValues;
            console.log('oracle request received:', index, airline, flight, timestamp);
            processOracleRequest(parseInt(index), airline, flight, timestamp);
        })
        .on('error', (error, receipt) => {
            console.log('error:', error);
        });
}

function listenForFlightStatusInfo() {
    web3ethContract.events.FlightStatusInfo({fromBlock: block})
        .on("connected", (subId) => {
            console.log(`listening for 'FlightStatusInfo' events, subscription ID: ${subId}`);
        })
        .on('data', (event) => {
            let {airline, flight, timestamp, status} = event.returnValues;
            console.log('flight status info received:', airline, flight, timestamp, status);
        })
        .on('error', (error, receipt) => {
            console.log('error:', error);
        });
}

function processOracleRequest(index, airline, flight, timestamp) {
    let matching = oracles.filter(oracle => { return oracle.indexes.includes(index); });
    console.log(`found ${matching.length} oracles with matching index ${index}`);
    let status1 = getRandomNumber(0, 5) * 10;
    let status2 = getRandomNumber(0, 5) * 10;
    matching.forEach(oracle => {
        let status = FORCE_LATE_AIRLINE ? 20 : (getRandomNumber(0, 1) ? status1 : status2);
        submitOracleResponse(oracle.address, index, airline, flight, timestamp, status);
    });
}

async function submitOracleResponse(from, index, airline, flight, timestamp, statusCode) {
    let options = {from: from, gas: '200000'};
    console.log('sending response:', from, '=>', statusCode);
    await web3ethContract.methods.submitOracleResponse(index, airline, flight, timestamp, statusCode).send(options)
        .catch((e) => {
            console.log('.: SEND FAILED :.', from, '=>', statusCode);
        });
}
