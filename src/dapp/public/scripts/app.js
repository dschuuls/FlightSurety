App = {
    web3Provider: null,
    contracts: {},
    metamaskAccountID: "0x0000000000000000000000000000000000000000",

    init: async function () {
        /// Setup access to blockchain
        return await App.initWeb3();
    },

    initWeb3: async function () {
        /// Find or Inject Web3 Provider
        /// Modern dApp browsers...
        if (window.ethereum) {
            App.web3Provider = window.ethereum;
            try {
                // Request account access
                await window.ethereum.enable();
            } catch (error) {
                // User denied account access...
                console.error("user denied account access")
            }
        }
        // Legacy dApp browsers...
        else if (window.web3) {
            App.web3Provider = window.web3.currentProvider;
        }
        // If no injected web3 instance is detected, fall back to Ganache
        else {
            App.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
        }

        App.getMetaMaskAccountID();

        return App.initFlightSurety();
    },

    getMetaMaskAccountID: function () {
        web3 = new Web3(App.web3Provider);

        // Retrieving accounts
        web3.eth.getAccounts(function(err, res) {
            if (err) {
                console.log('getMetaMaskID FAILED:', err);
                return;
            }
            console.log('getMetaMaskID SUCCESS:', res);
            App.metamaskAccountID = res[0];
        })
    },

    initFlightSurety: function () {
        var json = '../../contracts/FlightSuretyApp.json';
        $.getJSON(json, function(data) {
            console.log('contract data:', data);
            var artifact = data;
            App.contracts.FlightSurety = TruffleContract(artifact);
            App.contracts.FlightSurety.setProvider(App.web3Provider);
        });
        return App.bindEvents();
    },

    bindEvents: function() {

        document.getElementById('new-airline-form').onsubmit = (event) => {
            event.preventDefault();
            App.newAirlineAddress = document.getElementById('new-airline-address').value;
            App.newAirlineName = document.getElementById('new-airline-name').value;
            console.log(`registerAirline('${App.newAirlineName}', '${App.newAirlineAddress}', {from: '${App.metamaskAccountID}'});`);
            App.handleButtonClick(event, 1);
        };

        document.getElementById('register-flight-form').onsubmit = (event) => {
            event.preventDefault();
            App.newFlightNumber = document.getElementById('register-flight-number').value;
            let time = document.getElementById('register-flight-time').value;
            App.newFlightTime = Math.floor(Date.parse(time) / 1000);
            console.log(`registerFlight('${App.newFlightNumber}', '${App.newFlightTime}', {from: '${App.metamaskAccountID}'});`);
            App.handleButtonClick(event, 2);
        };

        document.getElementById('fetch-flight-form').onsubmit = (event) => {
            event.preventDefault();
            App.fetchFlightAddress = document.getElementById('fetch-flight-address').value;
            App.fetchFlightNumber = document.getElementById('fetch-flight-number').value;
            let time = document.getElementById('fetch-flight-time').value;
            App.fetchFlightTime = Math.floor(Date.parse(time) / 1000);
            console.log(`fetchFlightStatus('${App.fetchFlightAddress}', '${App.fetchFlightNumber}', '${App.fetchFlightTime}', {from: '${App.metamaskAccountID}'});`);
            App.handleButtonClick(event, 3);
        };

        document.getElementById('vote-airline-form').onsubmit = (event) => {
            event.preventDefault();
            App.voteAirlineAddress = document.getElementById('vote-airline-address').value;
            App.voteAirlineApprove = !document.getElementById('vote-airline-no').checked;
            console.log(`voteForAirline('${App.voteAirlineAddress}', '${App.voteAirlineApprove}', {from: '${App.metamaskAccountID}'});`);
            App.handleButtonClick(event, 4);
        };
    },

    handleButtonClick: async function(event, idx) {
        event.preventDefault();
        App.getMetaMaskAccountID();
        switch(idx) {
            case 1:
                await App.registerAirline(event);
                break;
            case 2:
                await App.registerFlight(event);
                break;
            case 3:
                await App.fetchFlightStatus(event);
                break;
            case 4:
                await App.voteForAirline(event);
        }
    },

    registerAirline: function(event) {
        event.preventDefault();
        App.contracts.FlightSurety.deployed().then(function(instance) {
            return instance.registerAirline(
                App.newAirlineAddress,
                App.newAirlineName,
                { from: App.metamaskAccountID }
            );
        }).then(function(result) {
            console.log('registerAirline SUCCESS:', result);
        }).catch(function(err) {
            console.log('registerAirline FAILED:', err.message);
        });
    },

    fundAirline: function() {
        App.contracts.FlightSurety.deployed().then(function(instance) {
            return instance.fund({ from: App.metamaskAccountID, value: web3.utils.toWei('10', 'ether') });
        }).then(function(result) {
            console.log('fundAirline SUCCESS:', result);
        }).catch(function(err) {
            console.log('fundAirline FAILED:', err.message);
        });
    },

    voteForAirline: function(event) {
        event.preventDefault();
        App.contracts.FlightSurety.deployed().then(function(instance) {
            return instance.vote(
                App.voteAirlineAddress,
                App.voteAirlineApprove,
                { from: App.metamaskAccountID }
            );
        }).then(function(result) {
            console.log('voteForAirline SUCCESS:', result);
        }).catch(function(err) {
            console.log('voteForAirline FAILED:', err.message);
        });
    },

    registerFlight: function(event) {
        event.preventDefault();
        App.contracts.FlightSurety.deployed().then(function(instance) {
            return instance.registerFlight(
                App.newFlightNumber,
                App.newFlightTime,
                { from: App.metamaskAccountID }
            );
        }).then(function(result) {
            console.log('registerFlight SUCCESS:', result);
        }).catch(function(err) {
            console.log('registerFlight FAILED:', err.message);
        });
    },

    fetchFlightStatus: function(event) {
        event.preventDefault();
        App.contracts.FlightSurety.deployed().then(function(instance) {
            return instance.fetchFlightStatus(
                App.fetchFlightAddress,
                App.fetchFlightNumber,
                App.fetchFlightTime,
                { from: App.metamaskAccountID }
            );
        }).then(function(result) {
            console.log('fetchFlightStatus SUCCESS:', result);
        }).catch(function(err) {
            console.log('fetchFlightStatus FAILED:', err.message);
        });
    }
};

window.onload = () => {
    App.init();
};
