// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
//import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
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

    /********************************************************************************************/
    /*                                       VARIABLES                                          */
    /********************************************************************************************/

    mapping(address => Airline) private airlines;

    mapping(address => Voting) private votings;

    mapping(bytes32 => Flight) private flights;

    Counters.Counter numApprovedAirlines;

    /********************************************************************************************/
    /*                                       CONSTANTS                                          */
    /********************************************************************************************/

    bytes32 public constant AUTHORIZED_CALLER = keccak256("AUTHORIZED_CALLER");

    /********************************************************************************************/
    /*                                       EVENTS                                             */
    /********************************************************************************************/

    event AirlineApproved(address adr);
    event AirlineRejected(address adr);

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
        require(hasRole(AUTHORIZED_CALLER, msg.sender), "Caller is not authorized");
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
        address senderAdr,
        address airlineAdr
    )
    pure
    internal
    returns (bytes32)
    {
        return keccak256(abi.encodePacked(senderAdr, airlineAdr));
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
    function addAirline(address adr, string memory name, State state)
    external
    onlyAuthorized()
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

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buy()
    external
    payable
    {

    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees()
    external
    pure
    {

    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay()
    external
    pure
    {

    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining
     *
     */
    function fund(address adr)
    public
    {
        require(isAirline(adr), "only airlines can set up a fund");
        airlines[adr].state = State.Funded;
    }

    function vote(
        address senderAdr,
        address airlineAdr,
        bool approve
    )
    public
    {
        Voting storage voting = votings[airlineAdr];
        require(voting.openForVotes, "this voting is not open");
        bytes32 key = getVoteKey(senderAdr, airlineAdr);
        require(!voting.votes[key], "can't vote twice");
        voting.ballots.push(approve);
        voting.votes[key] = true;
        checkApproval(airlineAdr);
    }

    function checkApproval(address airlineAdr)
    private
    {
        Voting storage voting = votings[airlineAdr];
        uint numVotes = voting.ballots.length;
        uint approvals = 0;
        for (uint i; i < numVotes; i++) {
            if (voting.ballots[i]) approvals++;
        }
        if (approvals * 100 / numApprovedAirlines.current() >= 50) {
            // not all airlines may have voted but the new airline is approved
            numApprovedAirlines.increment();
            voting.openForVotes = false;
            airlines[airlineAdr].state = State.Approved;
            emit AirlineApproved(airlineAdr);
        } else if (numVotes == numApprovedAirlines.current()) {
            // all airlines have voted and the approvals are less than 50 %
            voting.openForVotes = false;
            airlines[airlineAdr].state = State.Rejected;
            emit AirlineRejected(airlineAdr);
        }
    }

    /********************************************************************************************/
    /*                                       FALLBACK FUNCTIONS                                 */
    /********************************************************************************************/

    //    fallback()
    //        external
    //        payable
    //    {
    //        // TODO: check if sender is an airline
    //        // fund();
    //    }
    //
    //    receive()
    //        external
    //        payable
    //    {
    //        // TODO: check if sender is an airline
    //        // fund();
    //    }
}
