pragma solidity 0.4.24;


interface ERC20Token {
    function balanceOf(address owner_) external returns (uint);
    function allowance(address owner_, address spender_) external returns (uint);
    function transferFrom(address from_, address to_, uint value_) external returns (bool);
}
