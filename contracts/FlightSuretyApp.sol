// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./FlightSuretyData.sol";

contract FlightSuretyApp is Ownable, Pausable {

    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    /********************************************************************************************/
    /*                                       STRUCTS / ENUMS                                    */
    /********************************************************************************************/

    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;
    }

    // Model for responses from oracles
    struct ResponseInfo {
        address requester;                              // Account that requested status
        bool isOpen;                                    // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses;          // Mapping key is the status code reported
        // This lets us group responses and identify
        // the response that majority of the oracles
    }

    /********************************************************************************************/
    /*                                       VARIABLES                                          */
    /********************************************************************************************/

    // Instance of the data smart contract
    FlightSuretyData private dataContract;

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Track all oracle responses
    // Key = hash(index, airline, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    /********************************************************************************************/
    /*                                       CONSTANTS                                          */
    /********************************************************************************************/

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 5;

    // Number of airlines that can be registered without voting
    uint256 private constant NO_NEED_APPROVAL = 4;

    // Minimum ETH to set up funding by an airline
    uint256 public constant MINIMUM_FUNDING = 10 ether;

    // Flight status codes
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    /********************************************************************************************/
    /*                                       EVENTS                                             */
    /********************************************************************************************/

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(address airline, string flight, uint256 timestamp, uint8 status);

    event OracleReport(address airline, string flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 index, address airline, string flight, uint256 timestamp);

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.
    // All modifiers require an "_" which indicates where the function body will be added.

    modifier requireIsOperational() {
        require(isOperational(), "Contract is not operational at the moment");
        _;
    }

    modifier requireIsAirline(bool funded) {
        require(dataContract.isAirline(msg.sender), "need to be an airline");
        if (funded) require(dataContract.isFunded(msg.sender), "need to be a funded airline");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Contract constructor
    *
    */
    constructor(address dataContractAdr)
    {
        dataContract = FlightSuretyData(dataContractAdr);
    }

    /********************************************************************************************/
    /*                                       ADMIN FUNCTIONS                                    */
    /********************************************************************************************/

    function setOperatingStatus(bool operational)
        public
        onlyOwner()
    {
        if (operational) {
            require(paused(), "Contract needs to be paused to set it back to operational");
            _unpause();
        } else {
            require(!paused(), "Contract needs to be operational to set it to paused");
            _pause();
        }
    }

    function isOperational()
        public
        view
        returns (bool)
    {
        return !paused() && !dataContract.paused();
    }

    function setTestingMode(bool active)
        public
        onlyOwner()
        requireIsOperational()
    {

    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    )
        pure
        internal
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes(address account)
        internal
        returns (uint8[3] memory)
    {
        uint8[3] memory indexes;

        indexes[0] = getRandomIndex(account);

        do {
            indexes[1] = getRandomIndex(account);
        } while (indexes[1] == indexes[0]);

        do {
            indexes[2] = getRandomIndex(account);
        } while ((indexes[2] == indexes[0]) || (indexes[2] == indexes[1]));

        return indexes;
    }

    // Returns integers from 0-9
    function getRandomIndex(address account)
        internal
        returns (uint8)
    {
        uint8 maxValue = 10;
        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, account, ++nonce))) % maxValue);
        if (nonce > 250) nonce = 0;
        return random;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    // region AIRLINES

    /**
     * @dev Add an airline to the registration queue
     *
     */
    function registerAirline(address airline, string memory name)
        external
        requireIsOperational()
        returns (FlightSuretyData.State)
    {
        require(msg.sender == owner() || dataContract.isFunded(msg.sender), "need to be contract owner or funded airline");
        require(!dataContract.isAirline(airline), "cannot register airline twice");
        bool needsApproval = dataContract.approvedAirlinesCount() >= NO_NEED_APPROVAL;
        FlightSuretyData.State state = needsApproval ? FlightSuretyData.State.Queued : FlightSuretyData.State.Approved;
        dataContract.registerAirline(airline, name, state);
        return state;
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining
     *
     */
    function fundAirline()
        public
        payable
        requireIsOperational()
        requireIsAirline(false)
    {
        require(msg.value >= MINIMUM_FUNDING, "must pay enough ETH");
        dataContract.fundAirline(msg.sender);
    }

    function voteForAirline(address airline, bool approve)
        public
        requireIsOperational()
        requireIsAirline(true)
    {
        dataContract.voteForAirline(msg.sender, airline, approve);
    }

    // endregion

    // region FLIGHTS

    /**
     * @dev Register a future flight for insuring
     *
     */
    function registerFlight(string memory flight, uint256 timestamp)
        public
        requireIsOperational()
        requireIsAirline(true)
    {
        dataContract.registerFlight(msg.sender, flight, timestamp);
    }

    /**
     * @dev Called after oracle has updated flight status
     *
     */
    function processFlightStatus
    (
        address airline,
        string memory flight,
        uint256 timestamp,
        uint8 statusCode
    )
        internal
        requireIsOperational()
    {
        // receiving a STATUS_CODE_UNKNOWN here or the flight's status was changed already, we do nothing
        if (statusCode == STATUS_CODE_UNKNOWN || dataContract.getFlightStatus(airline, flight, timestamp) != STATUS_CODE_UNKNOWN) return;

        dataContract.updateFlight(airline, flight, timestamp, statusCode);

        if (statusCode == STATUS_CODE_LATE_AIRLINE) {
            // Insurees will be credited if the delay was caused by the airline...
            dataContract.creditInsurees(airline, flight, timestamp);
        } else {
            // Other causes of the delay will invalidate the policies, no payouts!
            dataContract.invalidatePolicies(airline, flight, timestamp);
        }
    }

    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus
    (
        address airline,
        string memory flight,
        uint256 timestamp
    )
    external
    {
        require(dataContract.isRegisteredFlight(airline, flight, timestamp), "no such flight is registered");
        require(dataContract.getFlightStatus(airline, flight, timestamp) == STATUS_CODE_UNKNOWN, "this flight's status is already verified");

        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));

        ResponseInfo storage responseInfo = oracleResponses[key];
        responseInfo.requester = msg.sender;
        responseInfo.isOpen = true;

        emit OracleRequest(index, airline, flight, timestamp);
    }

    // endregion

    // region INSURANCE

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buyInsurance(address airline, string memory flight, uint256 timestamp)
        external
        payable
        requireIsOperational()
    {
        require(dataContract.isRegisteredFlight(airline, flight, timestamp), "no such flight is registered");
        require(dataContract.getFlightStatus(airline, flight, timestamp) == STATUS_CODE_UNKNOWN, "this flight's status is already verified");
        require(msg.value <= 1 ether, "max insurance purchase is 1 ETH");
        dataContract.registerInsurance(airline, flight, timestamp, msg.sender, msg.value);
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function getPayout()
        external
        requireIsOperational()
    {
        require(dataContract.getAvailableBalance(msg.sender) > 0, "no payout balance available");
        uint256 payoutAmount = dataContract.getAvailableBalance(msg.sender);
        dataContract.registerPayout(msg.sender);
        payable(msg.sender).transfer(payoutAmount);
    }

    // endregion

    // region ORACLE MANAGEMENT

    // Register an oracle with the contract
    function registerOracle()
        external
        payable
    {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({
            isRegistered: true,
            indexes: indexes
        });
    }

    // Get an oracle's three randomly generated indexes
    function getMyIndexes()
        view
        external
        returns (uint8[3] memory)
    {
        require(oracles[msg.sender].isRegistered, "Not registered as an oracle");
        return oracles[msg.sender].indexes;
    }

    // Called by oracle when a response is available to an outstanding request.
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome).
    function submitOracleResponse
    (
        uint8 index,
        address airline,
        string memory flight,
        uint256 timestamp,
        uint8 statusCode
    )
    external
    {
        require(oracles[msg.sender].isRegistered, "not registered as an oracle");
        require((oracles[msg.sender].indexes[0] == index) || (oracles[msg.sender].indexes[1] == index) || (oracles[msg.sender].indexes[2] == index), "sending oracle's indexes not matching index in response");

        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        require(oracleResponses[key].isOpen, "there's no open oracle request with these args");

        oracleResponses[key].responses[statusCode].push(msg.sender);
        emit OracleReport(airline, flight, timestamp, statusCode);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        if (oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES) {
            // To whom it may concern
            emit FlightStatusInfo(airline, flight, timestamp, statusCode);
            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }

    // endregion

    /********************************************************************************************/
    /*                                       FALLBACK FUNCTIONS                                 */
    /********************************************************************************************/

    //    fallback()
    //        external
    //        payable
    //    {
    //        fund();
    //    }
    //
    //    receive()
    //        external
    //        payable
    //    {
    //        fund();
    //    }
}   
