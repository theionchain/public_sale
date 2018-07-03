import 'web3-typed/callback/web3';
import * as Web3 from 'web3';
import { IContractInstance, ISimpleCallable, address, IContract, ITXResult } from './globals';
import { NumberLike } from 'bignumber.js';

interface Artifacts {
  require(name: './IonChain.sol'): IContract<IIonChain>;
  require(name: './IonChainICO.sol'): IContract<IIonChainICO>;
  require(name: './Migrations.sol'): IContract<IContractInstance>;
}

declare global {
  const artifacts: Artifacts;
}

declare const enum ICOState {
  // ICO is not active and not started
  Inactive = 0,
  // ICO is active, tokens can be distributed among investors.
  // ICO parameters (end date, hard/low caps) cannot be changed.
  Active = 1,
  // ICO is suspended, tokens cannot be distributed among investors.
  // ICO can be resumed to `Active state`.
  // ICO parameters (end date, hard/low caps) may changed.
  Suspended = 2,
  // ICO is terminated by owner, ICO cannot be resumed.
  Terminated = 3,
  // ICO goals are not reached,
  // ICO terminated and cannot be resumed.
  NotCompleted = 4,
  // ICO completed, ICO goals reached successfully,
  // ICO terminated and cannot be resumed.
  Completed = 5
}

/**
 * The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
interface IOwnable {
  owner: ISimpleCallable<address>;

  transferOwnership(newOwner: address, tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

interface IWhitelisted extends IOwnable {

  // True if whitelist enabled
  whitelistEnabled: ISimpleCallable<boolean>;

  /**
   * Add address to ICO whitelist
   * @param addr Investor address
   */
  whitelist(addr: address, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Remove address from ICO whitelist
   * @param addr Investor address
   */
  blacklist(addr: address, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Enable whitelisting
   */
  enableWhitelist(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Disable whitelisting
   */
  disableWhitelist(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  whitelisted: {
    /**
     * Returns true if given address in ICO whitelist
     */
    call(addr: address, tr?: Web3.TransactionRequest): Promise<boolean>;
  };
}

/**
 * Base contract which allows children to
 * implement main operations locking mechanism.
 */
interface ILockable extends IOwnable {
  locked: ISimpleCallable<boolean>;

  lock(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  unlock(tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

interface IBaseFixedERC20Token extends IContractInstance, ILockable {
  // ERC20 Total supply
  totalSupply: ISimpleCallable<NumberLike>;

  /**
   * Gets the balance of the specified address.
   * @param owner The address to query the the balance of.
   * @return An uint representing the amount owned by the passed address.
   */
  balanceOf: {
    call(owner: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };

  /**
   * Transfer token for a specified address
   * @param to The address to transfer to.
   * @param value The amount to be transferred.
   */
  transfer(to: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * @dev Transfer tokens from one address to another
   * @param from address The address which you want to send tokens from
   * @param to address The address which you want to transfer to
   * @param value uint the amount of tokens to be transferred
   */
  transferFrom(from: address, to: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   *
   * Beware that changing an allowance with this method brings the risk that someone may use both the old
   * and the new allowance by unfortunate transaction ordering.
   *
   * To change the approve amount you first have to reduce the addresses
   * allowance to zero by calling `approve(spender, 0)` if it is not
   * already 0 to mitigate the race condition described in:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   *
   * @param spender The address which will spend the funds.
   * @param value The amount of tokens to be spent.
   */
  approve(spender: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Function to check the amount of tokens that an owner allowed to a spender.
   * @param owner address The address which owns the funds.
   * @param spender address The address which will spend the funds.
   * @return A uint specifying the amount of tokens still available for the spender.
   */
  allowance: {
    call(owner: address, spender: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };
}

/**
 * ERC20 compliant IONC Token
 */
interface IIonChain extends IBaseFixedERC20Token {
  // Token name
  name: ISimpleCallable<string>;

  // Token symbol
  symbol: ISimpleCallable<string>;

  // Token decimals
  decimals: ISimpleCallable<NumberLike>;

}

interface IBaseICO extends IContractInstance, IOwnable, IWhitelisted {
  // ICO controlled token
  token: ISimpleCallable<address>;

  // Team wallet
  teamWallet: ISimpleCallable<address>;

  // Current ICO state.
  state: ISimpleCallable<number>;

  // ICO start date seconds since epoch.
  startAt: ISimpleCallable<NumberLike>;

  // ICO end date seconds since epoch.
  endAt: ISimpleCallable<NumberLike>;

  // Minimal amount of investments in wei needed for successful ICO
  lowCapWei: ISimpleCallable<NumberLike>;

  // Maximal amount of investments in wei for this ICO.
  // If reached ICO will be in `Completed` state.
  hardCapWei: ISimpleCallable<NumberLike>;

  // Minimal amount of investments in wei per investor.
  lowCapTxWei: ISimpleCallable<NumberLike>;

  // Maximal amount of investments in wei per investor.
  hardCapTxWei: ISimpleCallable<NumberLike>;

  // Number of investments collected by this ICO
  collectedWei: ISimpleCallable<NumberLike>;

  /**
   * Trigger start of ICO.
   * @param endAt ICO end date, seconds since epoch.
   */
  start(endAt: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Suspend this ICO.
   * ICO can be activated later by calling `resume()` function.
   * In suspend state, ICO owner can change basic ICO parameter using `tune()` function,
   * tokens cannot be distributed among investors.
   */
  suspend(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Terminate the ICO.
   * ICO goals are not reached, ICO terminated and cannot be resumed.
   */
  terminate(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * @dev Change basic ICO parameters. Can be done only during `Suspended` state.
   * Any provided parameter is used only if it is not zero.
   * @param endAt ICO end date seconds since epoch. Used if it is not zero.
   * @param lowCapWei ICO low capacity. Used if it is not zero.
   * @param hardCapWei ICO hard capacity. Used if it is not zero.
   * @param lowCapTxWei Min limit for ICO per transaction
   * @param hardCapTxWei Hard limit for ICO per transaction
   */
  tune(
      endAt: NumberLike,
      lowCapWei: NumberLike,
      hardCapWei: NumberLike,
      lowCapTxWei: NumberLike,
      hardCapTxWei: NumberLike,
      tr?: Web3.TransactionRequest
  ): Promise<ITXResult>;

  /**
   * Resume a previously suspended ICO.
   */
  resume(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Recalculate ICO state based on current block time.
   * Should be called periodically by ICO owner.
   */
  touch(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Buy tokens. (payable)
   */
  buyTokens(tr?: Web3.TransactionRequest): Promise<ITXResult>;

}

/**
 * Ionc token ICO smart contract.
 */
interface IIonChainICO extends IBaseICO {
  // 1e18 WEI == 1ETH == 125000 tokens
  ETH_TOKEN_EXCHANGE_RATIO: ISimpleCallable<NumberLike>;

  // Token holder
  tokenHolder: ISimpleCallable<address>;

  // timestamp for end of personal cap
  personalCapEndAt: ISimpleCallable<NumberLike>;
}
