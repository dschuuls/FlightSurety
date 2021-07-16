var Test = require('./config.js');

contract('FlightSurety Tests', async (accounts) => {

    var config;
    before('setup contract', async () => {
        config = await Test.Config(accounts);
        await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
    });

    /****************************************************************************************/
    /* Operations and Settings                                                              */
    /****************************************************************************************/

    it(`(multiparty) has correct initial isOperational() value`, async function () {

        // Get operating status
        let status = await config.flightSuretyData.isOperational.call();
        assert.equal(status, true, "Incorrect initial operating status value");

    });

    it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

        // Ensure that access is denied for non-Contract Owner account
        let accessDenied = false;
        try {
            await config.flightSuretyData.setOperatingStatus(false, {from: config.testAddresses[2]});
        } catch (e) {
            accessDenied = true;
        }
        assert.equal(accessDenied, true, "Access not restricted to Contract Owner");

    });

    it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

        // Ensure that access is allowed for Contract Owner account
        let accessDenied = false;
        try {
            await config.flightSuretyData.setOperatingStatus(false);
        } catch (e) {
            accessDenied = true;
        }
        assert.equal(accessDenied, false, "Access not restricted to Contract Owner");

    });

    it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

        //await config.flightSuretyData.setOperatingStatus(false); // should still be paused from prior test

        let reverted = false;
        try {
            await config.flightSuretyApp.setTestingMode(true);
        } catch (e) {
            reverted = true;
        }
        assert.equal(reverted, true, "Access not blocked for requireIsOperational");

        // Set it back for other tests to work
        await config.flightSuretyData.setOperatingStatus(true);

    });

    it('(airline) the contract owner can register an airline using registerAirline()', async () => {

        // ARRANGE
        let newAirline = config.firstAirline;

        // ACT

        // call of the function to get the return value:
        let state = await config.flightSuretyApp.registerAirline.call(newAirline, "airline 1", {from: config.owner});
        // invoking again (without call) to save the data:
        await config.flightSuretyApp.registerAirline(newAirline, "airline 1", {from: config.owner});
        // checking if the registration was successful:
        let isAirline = await config.flightSuretyData.isAirline.call(newAirline);

        // ASSERT
        assert.equal(state, 4, "The new airline should be registered and approved (state = 4)");
        assert.equal(isAirline, true, "The contract owner should be able to register a new airline");

    });

    it('(airline) it is not possible to register an airline twice', async () => {

        // ARRANGE
        let reverted = false;
        let newAirline = config.firstAirline; // this one was already added in the prior test

        // ACT
        try {
            await config.flightSuretyApp.registerAirline(newAirline, "airline 1", {from: config.owner});
        } catch (e) {
            reverted = true;
        }

        // ASSERT
        assert.equal(reverted, true, "Registering a new airline twice should fail");

    });

    it('(airline) an airline cannot register a new airline using registerAirline(), if it is not funded', async () => {

        // ARRANGE
        let reverted = false;
        let newAirline = accounts[2];

        // ACT
        let funded = await config.flightSuretyData.isFunded.call(config.firstAirline);
        try {
            await config.flightSuretyApp.registerAirline(newAirline, "airline 2", {from: config.firstAirline});
        } catch (e) {
            reverted = true;
        }
        let isAirline = await config.flightSuretyData.isAirline.call(newAirline);

        // ASSERT
        assert.equal(funded, false, "the first airline added should not be funded yet at this point ...");
        assert.equal(isAirline, false, "... so it should not be able to register another airline here");
        assert.equal(reverted, true, "should have reverted because airline is not funded");

    });

    it('(airline) a registered airline can send ETH to set up it\'s funding' , async () => {

        // ARRANGE
        let reverted = false;
        let amountTooLow = web3.utils.toWei('3', "ether");
        let correctAmount = web3.utils.toWei('10', "ether");

        // ACT
        try {
            await config.flightSuretyApp.fundAirline({from: config.firstAirline, value: amountTooLow});
        } catch (e) {
            reverted = true;
        }

        let try1 = await config.flightSuretyData.isFunded.call(config.firstAirline);
        await config.flightSuretyApp.fundAirline({from: config.firstAirline, value: correctAmount});
        let try2 = await config.flightSuretyData.isFunded.call(config.firstAirline);

        // ASSERT
        assert.equal(try1, false, "the amount in the first try should be too low");
        assert.equal(reverted, true, "first try should have resulted in a reverted tx");
        assert.equal(try2, true, "the second try should pass, the amount was correct");

    });

    it('(airline) a funded airline can register a new airline using registerAirline()', async () => {

        // ARRANGE
        let newAirline = accounts[2];

        // ACT
        await config.flightSuretyApp.registerAirline(newAirline, "airline 2", {from: config.firstAirline});
        let funded = await config.flightSuretyData.isFunded.call(config.firstAirline);
        let isAirline = await config.flightSuretyData.isAirline.call(newAirline);

        // ASSERT
        assert.equal(funded, true, "the first airline added should be funded now ...");
        assert.equal(isAirline, true, "... so it should be able to register the other airline");

    });

    it('(airline) four airlines can be registered without the need to be approved', async () => {

        // ARRANGE
        let airline3 = accounts[3];
        let airline4 = accounts[4];
        let airline5 = accounts[5];

        // ACT
        let state3 = await config.flightSuretyApp.registerAirline.call(airline3, "airline 3", {from: config.firstAirline});
        await config.flightSuretyApp.registerAirline(airline3, "airline 3", {from: config.firstAirline});

        let state4 = await config.flightSuretyApp.registerAirline.call(airline4, "airline 4", {from: config.firstAirline});
        await config.flightSuretyApp.registerAirline(airline4, "airline 4", {from: config.firstAirline});

        let numBefore = await config.flightSuretyData.approvedAirlinesCount.call();

        let state5 = await config.flightSuretyApp.registerAirline.call(airline5, "airline 5", {from: config.firstAirline});
        await config.flightSuretyApp.registerAirline(airline5, "airline 5", {from: config.firstAirline});

        let numAfter = await config.flightSuretyData.approvedAirlinesCount.call();

        let isAirline = await config.flightSuretyData.isAirline.call(airline5);

        // ASSERT
        assert.equal(numBefore, 4, "we should have 4 approved airlines");
        assert.equal(numAfter, 4, "should still be 4 approved airlines");

        assert.equal(state3, 4, "should be approved (state = 4)");
        assert.equal(state4, 4, "should be approved (state = 4)");

        assert.equal(isAirline, true, "airline 5 should be registered as airline now");
        assert.equal(state5, 3, "airline 5 should be in queue for approval (state = 3)");

    });

    it('(airline) only funded airlines can vote for a new airline to be approved', async () => {

        // ARRANGE
        let reverted = false;
        let airline2 = accounts[2];
        let airline5 = accounts[5];

        // ACT
        try {
            await config.flightSuretyApp.voteForAirline(airline5, true, {from: airline2}); // airline 2 is not funded yet
        } catch (e) {
            reverted = true;
        }

        // ASSERT
        assert.equal(reverted, true, "airline 2 shouldn't be able to vote, it is not funded");

    });

    it('(airline) a funded airline can not vote twice for a new airline to be approved', async () => {

        // ARRANGE
        let reverted = false;
        let airline5 = accounts[5];

        // ACT
        try {
            await config.flightSuretyApp.voteForAirline(airline5, true, {from: config.firstAirline});
            await config.flightSuretyApp.voteForAirline(airline5, false, {from: config.firstAirline});
        } catch (e) {
            reverted = true;
        }

        // ASSERT
        assert.equal(reverted, true, "airline 1 shouldn't be able to vote twice");

    });

    it('(airline) a new airline will be rejected when too few airlines vote for it', async () => {

        // ARRANGE
        let eth = web3.utils.toWei('10', "ether");
        let airline2 = accounts[2];
        let airline3 = accounts[3];
        let airline4 = accounts[4];
        let airline5 = accounts[5];

        // ACT

        await config.flightSuretyApp.fundAirline({from: airline2, value: eth});
        await config.flightSuretyApp.fundAirline({from: airline3, value: eth});
        await config.flightSuretyApp.fundAirline({from: airline4, value: eth});

        // airline 1 already did vote with 'true'
        await config.flightSuretyApp.voteForAirline(airline5, false, {from: airline2});
        await config.flightSuretyApp.voteForAirline(airline5, false, {from: airline3});
        await config.flightSuretyApp.voteForAirline(airline5, false, {from: airline4});

        // ASSERT
        config.flightSuretyData.getPastEvents("AirlineRejected", {fromBlock: 0, toBlock: "latest"})
            .then(log => assert.equal(log[0].event, 'AirlineRejected', 'Invalid event emitted'));

    });

    it('(airline) a new airline will be approved when enough airlines vote for it', async () => {

        // ARRANGE
        let airline1 = accounts[1];
        let airline2 = accounts[2];
        let airline3 = accounts[3];
        let airline6 = accounts[6];

        // ACT
        await config.flightSuretyApp.registerAirline(airline6, "airline 6", {from: config.owner});

        let numBefore = await config.flightSuretyData.approvedAirlinesCount.call();

        await config.flightSuretyApp.voteForAirline(airline6, true, {from: airline1});
        await config.flightSuretyApp.voteForAirline(airline6, false, {from: airline2});
        await config.flightSuretyApp.voteForAirline(airline6, true, {from: airline3});

        let numAfter = await config.flightSuretyData.approvedAirlinesCount.call();

        // ASSERT
        config.flightSuretyData.getPastEvents("AirlineApproved", {fromBlock: 0, toBlock: "latest"})
            .then(log => assert.equal(log[0].event, 'AirlineApproved', 'Invalid event emitted'));

        assert.equal(numBefore, 4, '4 airlines should be approved by now');
        assert.equal(numAfter, 5, 'airline 6 should be approved now also');

    });

    it('(flight) an airline won\'t be able to register a flight until it\'s funded', async () => {

        // ARRANGE
        let reverted = false;
        let airline = accounts[6];
        let flight = 'ND1309'; // Course number
        let timestamp = 1656633600; // Friday, 1 July 2022 00:00:00

        // ACT

        try {
            await config.flightSuretyApp.registerFlight(flight, timestamp, {from: airline});
        } catch(e) {
            reverted = true;
        }

        let regBefore = await config.flightSuretyData.isRegisteredFlight(airline, flight, timestamp);

        await config.flightSuretyApp.fundAirline({from: airline, value: web3.utils.toWei('10', 'ether')});
        await config.flightSuretyApp.registerFlight(flight, timestamp, {from: airline});

        let regAfter = await config.flightSuretyData.isRegisteredFlight(airline, flight, timestamp);

        // ASSERT
        assert.equal(reverted, true, 'registering from unfunded airline should fail');
        assert.equal(regBefore, false, 'flight should not be registered by unfunded airline');
        assert.equal(regAfter, true, 'flight should be registered after funding');

    });

    it('(flight) a passenger can\'t buy insurance for a flight for more than 1 ETH', async () => {

        // ARRANGE
        let passenger = accounts[7];
        let reverted = false;
        let airline = accounts[6];
        let flight = 'ND1309'; // Course number
        let timestamp = 1656633600; // Friday, 1 July 2022 00:00:00

        // ACT

        try {
            await config.flightSuretyApp.buyInsurance(airline, flight, timestamp, {from: passenger, value: web3.utils.toWei('1.5', 'ether')});
        } catch(e) {
            reverted = true;
        }

        // ASSERT
        assert.equal(reverted, true, 'buying insurance for more than 1 ETH should fail');

    });

    it('(flight) a passenger can buy insurance for a flight for 1 ETH or less', async () => {

        // ARRANGE
        let passenger = accounts[7];
        let airline = accounts[6];
        let flight = 'ND1309'; // Course number
        let timestamp = 1656633600; // Friday, 1 July 2022 00:00:00
        let amount = '0.8';
        let gasPrice = await web3.eth.getGasPrice();

        // ACT
        let balanceBefore = await web3.eth.getBalance(passenger);
        let tx = await config.flightSuretyApp.buyInsurance(airline, flight, timestamp, {from: passenger, value: web3.utils.toWei(amount, 'ether')});
        let balanceAfter = await web3.eth.getBalance(passenger);

        // ASSERT
        assert.equal(balanceAfter, balanceBefore - web3.utils.toWei(amount, 'ether') - (tx.receipt.gasUsed * gasPrice), 'account balance doesn\'t sum up correctly');

    });

    it('(flight) can generate a request for oracles to fetch flight information', async () => {

        // ARRANGE
        let airline = accounts[6];
        let flight = 'ND1309'; // Course number
        let timestamp = 1656633600; // Friday, 1 July 2022 00:00:00

        // ACT
        await config.flightSuretyApp.fetchFlightStatus(airline, flight, timestamp, {from: config.owner});

        // ASSERT
        config.flightSuretyApp.getPastEvents("OracleRequest", {fromBlock: 0, toBlock: "latest"})
            .then(log => assert.equal(log[0].event, 'OracleRequest', 'Invalid event emitted'));

    });
});
