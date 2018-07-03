pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseFixedERC20Token.sol";


/**
 * @title IONC token contract.
 */
contract IonChain is BaseFixedERC20Token {
    using SafeMath for uint;

    string public constant name = "IonChain";

    string public constant symbol = "IONC";

    uint8 public constant decimals = 6;

    uint internal constant ONE_TOKEN = 1e6;

    constructor(uint totalSupplyTokens_) public {
        locked = false;
        totalSupply = totalSupplyTokens_ * ONE_TOKEN;
        address creator = msg.sender;
        balances[creator] = totalSupply;

        emit Transfer(0, this, totalSupply);
        emit Transfer(this, creator, balances[creator]);
    }

    // Disable direct payments
    function() external payable {
        revert();
    }

}
