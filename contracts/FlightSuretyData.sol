// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract FlightSuretyData is Ownable, Pausable, AccessControl {

    using Counters for Counters.Counter;
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    /********************************************************************************************/
    /*                                       STRUCTS / ENUMS                                    */
    /********************************************************************************************/

    enum State {
        Unknown,
        Rejected,
        Removed,
        Queued, // 3
        Approved, // 4
        Funded // 5
    }

    struct Airline {
        string name;
        uint registered;
        State state;
    }

    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;
        address airline;
    }

    struct Voting {
        bool openForVotes;
        bool[] ballots;
        mapping(bytes32 => bool) votes;  // voteKeys, to prevent multiple voting
    }

    struct Policy {
        address passenger;
        uint256 amount;
    }

    /********************************************************************************************/
    /*                                       VARIABLES                                          */
    /********************************************************************************************/

    mapping(address => Airline) private airlines;

    mapping(address => Voting) private votings;

    mapping(bytes32 => Flight) private flights;

    Counters.Counter numApprovedAirlines;

    mapping(bytes32 => Policy[]) private insurancePolicies;

    mapping(address => uint256) private passengerPayouts;

    /********************************************************************************************/
    /*                                       CONSTANTS                                          */
    /********************************************************************************************/

    bytes32 public constant AUTHORIZED_CALLER = keccak256("AUTHORIZED_CALLER");

    /********************************************************************************************/
    /*                                       EVENTS                                             */
    /********************************************************************************************/

    event AirlineApproved(address airline);
    event AirlineRejected(address airline);

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor()
    {

    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.
    // All modifiers require an "_" which indicates where the function body will be added.

    modifier onlyAuthorized() {
        require(hasRole(AUTHORIZED_CALLER, msg.sender), "caller is not authorized");
        _;
    }

    modifier requireIsOperational() {
        require(isOperational(), "Contract is not operational at the moment");
        _;
    }

    /********************************************************************************************/
    /*                                       ADMIN FUNCTIONS                                    */
    /********************************************************************************************/

    function authorizeCaller(address adr)
        public
        onlyOwner()
    {
        _setupRole(AUTHORIZED_CALLER, adr);
    }

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
        return !paused();
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

    function getVoteKey(
        address sender,
        address airline
    )
        pure
        internal
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(sender, airline));
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    function isAirline(address adr)
        public
        view
        returns (bool)
    {
        return airlines[adr].registered > 0;
    }

    function isFunded(address adr)
        public
        view
        returns (bool)
    {
        return airlines[adr].state == State.Funded;
    }

    function isRegisteredFlight(address airlineAdr, string memory flight, uint256 timestamp)
        public
        view
        returns (bool)
    {
        bytes32 key = getFlightKey(airlineAdr, flight, timestamp);
        return flights[key].isRegistered;
    }

    function getFlightStatus(address airlineAdr, string memory flight, uint256 timestamp)
        public
        view
        returns (uint8)
    {
        bytes32 key = getFlightKey(airlineAdr, flight, timestamp);
        return flights[key].statusCode;
    }

    function approvedAirlinesCount()
        public
        view
        returns (uint256)
    {
        return numApprovedAirlines.current();
    }

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     *
     */
    function registerAirline(address adr, string memory name, State state)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        airlines[adr] = Airline({
            name: name,
            state: state,
            registered: block.timestamp
        });

        if (state == State.Approved) {
            numApprovedAirlines.increment();
        } else if (state == State.Queued) {
            Voting storage newVoting = votings[adr];
            newVoting.openForVotes = true;
        }
    }

    function registerInsurance(address airlineAdr, string memory flightNum, uint256 flightTime, address passenger, uint256 amount)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        bytes32 key = getFlightKey(airlineAdr, flightNum, flightTime);
        Policy memory newPolicy = Policy({
            passenger: passenger,
            amount: amount
        });
        insurancePolicies[key].push(newPolicy);
    }

    /**
     *  @dev Credits payouts to insurees
     */
    function creditInsurees(address airlineAdr, string memory flightNum, uint256 flightTime)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        bytes32 key = getFlightKey(airlineAdr, flightNum, flightTime);
        Policy[] storage flightPolicies = insurancePolicies[key];
        while (flightPolicies.length > 0) {
            Policy memory passengerPolicy = flightPolicies[flightPolicies.length - 1];
            flightPolicies.pop();
            uint256 payoutAmount = passengerPolicy.amount.mul(15).div(10);
            uint256 existingPayout = passengerPayouts[passengerPolicy.passenger];
            passengerPayouts[passengerPolicy.passenger] = existingPayout.add(payoutAmount);
        }
    }

    function invalidatePolicies(address airlineAdr, string memory flightNum, uint256 flightTime)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        bytes32 key = getFlightKey(airlineAdr, flightNum, flightTime);
        Policy[] storage flightPolicies = insurancePolicies[key];
        while (flightPolicies.length > 0) {
            flightPolicies.pop();
        }
    }

    function getAvailableBalance(address passenger)
        external
        view
        returns (uint256)
    {
        return passengerPayouts[passenger];
    }

    function registerPayout(address passenger)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        passengerPayouts[passenger] = 0;
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining
     *
     */
    function fundAirline(address airline)
        external
        onlyAuthorized()
        requireIsOperational()
    {
        airlines[airline].state = State.Funded;
    }

    function voteForAirline(
        address sender,
        address airline,
        bool approve
    )
        external
        onlyAuthorized()
        requireIsOperational()
    {
        Voting storage voting = votings[airline];
        require(voting.openForVotes, "this voting is not open");
        bytes32 key = getVoteKey(sender, airline);
        require(!voting.votes[key], "can't vote twice");
        voting.ballots.push(approve);
        voting.votes[key] = true;
        checkApproval(airline);
    }

    function registerFlight(
        address airline,
        string memory flight,
        uint256 timestamp
    )
        external
        onlyAuthorized()
        requireIsOperational()
    {
        bytes32 key = getFlightKey(airline, flight, timestamp);
        require(!flights[key].isRegistered, "this flight is already registered");

        flights[key] = Flight({
            isRegistered: true,
            statusCode: 0,
            updatedTimestamp: block.timestamp,
            airline: airline
        });
    }

    function updateFlight(
        address airline,
        string memory flight,
        uint256 timestamp,
        uint8 statusCode
    )
        external
        onlyAuthorized()
        requireIsOperational()
    {
        require(isRegisteredFlight(airline, flight, timestamp), "no such flight is registered");
        bytes32 key = getFlightKey(airline, flight, timestamp);
        flights[key].statusCode = statusCode;
        flights[key].updatedTimestamp = block.timestamp;
    }

    function checkApproval(address airline)
        private
        requireIsOperational()
    {
        Voting storage voting = votings[airline];
        uint numVotes = voting.ballots.length;
        uint approvals = 0;
        for (uint i; i < numVotes; i++) {
            if (voting.ballots[i]) approvals++;
        }
        if (approvals * 100 / numApprovedAirlines.current() >= 50) {
            // not all airlines may have voted but the new airline is approved
            numApprovedAirlines.increment();
            voting.openForVotes = false;
            airlines[airline].state = State.Approved;
            emit AirlineApproved(airline);
        } else if (numVotes == numApprovedAirlines.current()) {
            // all airlines have voted and the approvals are less than 50 %
            voting.openForVotes = false;
            airlines[airline].state = State.Rejected;
            emit AirlineRejected(airline);
        }
    }

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
