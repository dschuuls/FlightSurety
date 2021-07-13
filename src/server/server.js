const AppContract = require('../../build/contracts/FlightSuretyApp.json');
const config = require('./config.json')['localhost'];
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require('web3');

const MNEMONIC = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
const ORACLES_COUNT = 50;

let appContract;
let gas;
let oracles = [];
let provider;
let startingBlock = 0;
let web3;

start();

async function start() {
    await init();
    listenForOracleRequests();
}

async function init() {
    console.log('initializing ...');
    provider = new HDWalletProvider(MNEMONIC, config.url, 0, 100);
    web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
    gas = web3.utils.toWei('2', 'lovelace');
    appContract = new web3.eth.Contract(AppContract.abi, config.appAddress);
    startingBlock = await getBlockNumber();
    await registerOracles();
}

async function getBlockNumber() {
    web3.eth.getBlockNumber((error, result) => {
        if (!error) return result;
        else console.log(error);
    });
}

async function registerOracles() {
    let adr = provider.addresses;
    let fee = await appContract.methods.REGISTRATION_FEE().call({from: adr[0]});
    for (let i = 1; i <= ORACLES_COUNT; i++) {
        await appContract.methods.registerOracle().send({from: adr[i], value: fee, gas: gas})
            .then((receipt) => {
                console.log(`oracle #${i} registered, gas used: ${receipt.gasUsed}`);
            })
            .catch(console.log);
        await appContract.methods.getMyIndexes().call({from: adr[i]})
            .then((result) => {
                console.log(`   indexes: ${result[0]}, ${result[1]}, ${result[2]}, address: ${adr[i]}`);
                oracles.push({address: adr[i], indexes: [result[0], result[1], result[2]]});
            })
            .catch(console.log);
    }
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
    let indexed = oracles.filter(oracle => {
        return oracle.indexes.includes(index);
    });
    console.log(`found ${indexed.length} oracles with matching index`);
    indexed.forEach(oracle => {
        submitOracleResponse(oracle.address, index, airline, flight, timestamp, randomStatus() * 10);
    });
}

async function submitOracleResponse(from, index, airline, flight, timestamp, statusCode) {
    let options = {from: from, gas: gas};
    console.log('sending oracle response:', from, '=>', statusCode);
    await appContract.methods.submitOracleResponse(index, airline, flight, timestamp, statusCode).send(options)
        .catch(console.log);
}

function randomStatus() {
    let min = 0, max = 5;
    return Math.floor(
        Math.random() * (max - min + 1) + min
    )
}
