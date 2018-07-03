pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseICO.sol";


/**
 * @title IONC tokens ICO contract.
 */
contract IonChainICO is BaseICO {
    using SafeMath for uint;

    /// @dev 6 decimals for token
    uint internal constant ONE_TOKEN = 1e6;

    /// @dev 1e18 WEI == 1ETH == 125000 tokens
    uint public constant ETH_TOKEN_EXCHANGE_RATIO = 125000;

    /// @dev Token holder
    address public tokenHolder;

    // @dev personal cap for first 48 hours
    uint public constant PERSONAL_CAP = 1.6 ether;

    // @dev timestamp for end of personal cap
    uint public personalCapEndAt;

    // @dev purchases till personal cap limit end
    mapping(address => uint) internal personalPurchases;

    constructor(address icoToken_,
            address teamWallet_,
            address tokenHolder_,
            uint lowCapWei_,
            uint hardCapWei_,
            uint lowCapTxWei_,
            uint hardCapTxWei_) public {
        require(icoToken_ != address(0) && teamWallet_ != address(0));
        token = ERC20Token(icoToken_);
        teamWallet = teamWallet_;
        tokenHolder = tokenHolder_;
        state = State.Inactive;
        lowCapWei = lowCapWei_;
        hardCapWei = hardCapWei_;
        lowCapTxWei = lowCapTxWei_;
        hardCapTxWei = hardCapTxWei_;
    }

    /**
     * Accept direct payments
     */
    function() external payable {
        buyTokens();
    }


    function start(uint endAt_) onlyOwner public {
        uint requireTokens = hardCapWei.mul(ETH_TOKEN_EXCHANGE_RATIO).mul(ONE_TOKEN).div(1 ether);
        require(token.balanceOf(tokenHolder) >= requireTokens
            && token.allowance(tokenHolder, address(this)) >= requireTokens);
        personalCapEndAt = block.timestamp + 48 hours;
        super.start(endAt_);
    }

    /**
     * @dev Recalculate ICO state based on current block time.
     * Should be called periodically by ICO owner.
     */
    function touch() public {
        if (state != State.Active && state != State.Suspended) {
            return;
        }
        if (collectedWei >= hardCapWei) {
            state = State.Completed;
            endAt = block.timestamp;
            emit ICOCompleted(collectedWei);
        } else if (block.timestamp >= endAt) {
            if (collectedWei < lowCapWei) {
                state = State.NotCompleted;
                emit ICONotCompleted();
            } else {
                state = State.Completed;
                emit ICOCompleted(collectedWei);
            }
        }
    }

    function buyTokens() public onlyWhitelisted payable {
        require(state == State.Active &&
            block.timestamp <= endAt &&
            msg.value >= lowCapTxWei &&
            msg.value <= hardCapTxWei &&
            collectedWei + msg.value <= hardCapWei);
        uint amountWei = msg.value;

        // check personal cap
        if (block.timestamp <= personalCapEndAt) {
            personalPurchases[msg.sender] = personalPurchases[msg.sender].add(amountWei);
            require(personalPurchases[msg.sender] <= PERSONAL_CAP);
        }

        uint itokens = amountWei.mul(ETH_TOKEN_EXCHANGE_RATIO).mul(ONE_TOKEN).div(1 ether);
        collectedWei = collectedWei.add(amountWei);

        emit ICOInvestment(msg.sender, amountWei, itokens, 0);
        // Transfer tokens to investor
        token.transferFrom(tokenHolder, msg.sender, itokens);
        forwardFunds();
        touch();
    }
}
