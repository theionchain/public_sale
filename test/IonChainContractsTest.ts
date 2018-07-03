import {ItTestFn} from '../globals';
import * as BigNumber from 'bignumber.js';
import {assertEvmThrows} from './lib/assert';
import {ICOState, IIonChainICO} from "../contracts";
import {Seconds, web3IncreaseTimeTo, web3LatestTime} from "./lib/time";

const it = (<any>global).it as ItTestFn;
const assert = (<any>global).assert as Chai.AssertStatic;

const IonChain = artifacts.require('./IonChain.sol');
const IonChainICO = artifacts.require('./IonChainICO.sol');

const ONE_ETHER = new BigNumber('1e18');
const ONE_TOKEN = new BigNumber('1e6');
const ETH_TOKEN_EXCHANGE_RATIO = 125000;

function tokens(val: BigNumber.NumberLike): string {
  return new BigNumber(val).times(ONE_TOKEN).toString();
}

function tokens2wei(val: BigNumber.NumberLike): string {
  return new BigNumber(val)
      .mul(ONE_ETHER)
      .divToInt(ETH_TOKEN_EXCHANGE_RATIO)
      .toString();
}

function wei2rawtokens(val: BigNumber.NumberLike): string {
  return new BigNumber(val)
      .mul(ETH_TOKEN_EXCHANGE_RATIO)
      .mul(ONE_TOKEN)
      .divToInt(ONE_ETHER)
      .toString();
}

// ICO Instance
let Ico: IIonChainICO | null;

const state = {
  ownerTokenBalance: new BigNumber(0),
  someone1TokenBalance: new BigNumber(0),
  someone2TokenBalance: new BigNumber(0),
  teamWalletInitialBalance: new BigNumber('100e18'),
  teamWalletBalance: new BigNumber(0),
  tokenHolderTokenBalance: new BigNumber(0),
  sentWei: new BigNumber(0),
  investor1Wei: new BigNumber(0),
  investor2Wei: new BigNumber(0),
  investor3Wei: new BigNumber(0)
};

contract('IonChain', function (accounts: string[]) {
  let cnt = 0;
  const actors = {
    owner: accounts[cnt++], // token owner
    someone1: accounts[cnt++],
    someone2: accounts[cnt++],
    investor1: accounts[cnt++],
    investor2: accounts[cnt++],
    investor3: accounts[cnt++],
    teamWallet: accounts[cnt++],
    tokenHolder: accounts[cnt++],
  } as { [k: string]: string };
  console.log('Actors: ', actors);

  it('should be correct initial token state', async () => {
    const token = await IonChain.deployed();
    // Total supply
    assert.equal(await token.totalSupply.call(), tokens('1e9'));
    // Token not locked
    assert.equal(await token.locked.call(), false);
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // Token name
    assert.equal(await token.name.call(), 'IonChain');
    // Token symbol
    assert.equal(await token.symbol.call(), 'IONC');
    // Token decimals
    assert.equal(await token.decimals.call(), 6);
    // All tokens transferred to owner
    state.ownerTokenBalance = new BigNumber(await token.balanceOf.call(actors.owner));
    state.someone1TokenBalance = new BigNumber(await token.balanceOf.call(actors.someone1));
    state.someone2TokenBalance = new BigNumber(await token.balanceOf.call(actors.someone2));
    assert.equal(state.ownerTokenBalance.toString(), tokens('1e9'));
    assert.equal(state.someone1TokenBalance.toString(), '0');
    assert.equal(state.someone2TokenBalance.toString(), '0');
  });

  it('should be lockable', async () => {
    const token = await IonChain.deployed();
    // Token not locked
    assert.equal(await token.locked.call(), false);
    // lock allowed only for owner
    await assertEvmThrows(token.lock({from: actors.someone1}));
    let txres = await token.lock({from: actors.owner});
    assert.equal(txres.logs[0].event, 'Lock');

    // Token locked
    assert.equal(await token.locked.call(), true);
    // All actions locked
    await assertEvmThrows(token.transfer(actors.someone1, 1, {from: actors.owner}));
    await assertEvmThrows(token.transferFrom(actors.someone1, actors.someone1, 1, {from: actors.owner}));
    await assertEvmThrows(token.approve(actors.someone1, 1, {from: actors.owner}));

    // unlock allowed only for owner
    await assertEvmThrows(token.unlock({from: actors.someone1}));
    txres = await token.unlock({from: actors.owner});
    assert.equal(txres.logs[0].event, 'Unlock');
  });

  it('should be ownable', async () => {
    const token = await IonChain.deployed();
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // transferOwnership allowed only for owner
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.someone1}));
    let txres = await token.transferOwnership(actors.someone1, {from: actors.owner});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.owner);
    assert.equal(txres.logs[0].args.newOwner, actors.someone1);

    // Token change owner
    assert.equal(await token.owner.call(), actors.someone1);
    await assertEvmThrows(token.lock({from: actors.owner}));

    // Check access
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.owner}));
    txres = await token.lock({from: actors.someone1});
    assert.equal(txres.logs[0].event, 'Lock');
    assert.equal(await token.locked.call(), true);
    txres = await token.unlock({from: actors.someone1});
    assert.equal(txres.logs[0].event, 'Unlock');
    assert.equal(await token.locked.call(), false);

    // Return ownership
    txres = await token.transferOwnership(actors.owner, {from: actors.someone1});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.someone1);
    assert.equal(txres.logs[0].args.newOwner, actors.owner);
  });

  it('should be allow transfer', async () => {
    const token = await IonChain.deployed();

    // Cannot transfer more than balance
    await assertEvmThrows(token.transfer(actors.someone1, state.ownerTokenBalance.add(1), {from: actors.owner}));

    let transfer = new BigNumber(tokens('2e5'));
    let txres = await token.transfer(actors.someone1, transfer.toString(), {from: actors.owner});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.owner);
    assert.equal(txres.logs[0].args.to, actors.someone1);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    // check balances
    state.ownerTokenBalance = state.ownerTokenBalance.sub(transfer);
    state.someone1TokenBalance = state.someone1TokenBalance.add(transfer);
    assert.equal(await token.balanceOf.call(actors.owner), state.ownerTokenBalance.toString());
    assert.equal(await token.balanceOf.call(actors.someone1), state.someone1TokenBalance.toString());

    transfer = new BigNumber(tokens('1e5'));
    txres = await token.transfer(actors.someone2, transfer.toString(), {from: actors.someone1});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.someone1);
    assert.equal(txres.logs[0].args.to, actors.someone2);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    // check balances
    state.someone1TokenBalance = state.someone1TokenBalance.sub(transfer);
    state.someone2TokenBalance = state.someone2TokenBalance.add(transfer);
    assert.equal(await token.balanceOf.call(actors.someone1), state.someone1TokenBalance.toString());
    assert.equal(await token.balanceOf.call(actors.someone2), state.someone2TokenBalance.toString());
  });

  it('should be allow transferFrom', async () => {
    const token = await IonChain.deployed();

    // Cannot transferFrom without approve
    await assertEvmThrows(token.transferFrom(actors.owner, actors.someone2, 1, {from: actors.someone1}));

    // approve
    let approve = new BigNumber(tokens('2e5'));
    let transfer = approve.div(2);
    let txres = await token.approve(actors.someone1, approve.toString(), {from: actors.owner});
    assert.equal(txres.logs[0].event, 'Approval');
    assert.equal(txres.logs[0].args.owner, actors.owner);
    assert.equal(txres.logs[0].args.spender, actors.someone1);
    assert.equal(txres.logs[0].args.value, approve.toString());
    assert.equal(await token.allowance.call(actors.owner, actors.someone1), approve.toString());

    // cannot transfer more than allowed
    await assertEvmThrows(token.transferFrom(actors.owner, actors.someone2, approve.add(1), {from: actors.someone1}));

    // check transferFrom
    txres = await token.transferFrom(actors.owner, actors.someone2, transfer.toString(), {from: actors.someone1});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.owner);
    assert.equal(txres.logs[0].args.to, actors.someone2);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    assert.equal(await token.allowance.call(actors.owner, actors.someone1), approve.sub(transfer).toString());

    // check balances
    state.ownerTokenBalance = state.ownerTokenBalance.sub(transfer);
    state.someone2TokenBalance = state.someone2TokenBalance.add(transfer);
    assert.equal(await token.balanceOf.call(actors.owner), state.ownerTokenBalance.toString());
    assert.equal(await token.balanceOf.call(actors.someone1), state.someone1TokenBalance.toString()); // not changed
    assert.equal(await token.balanceOf.call(actors.someone2), state.someone2TokenBalance.toString());

    // double approve is forbidden
    await assertEvmThrows(token.approve(actors.someone1, 1, {from: actors.owner}));
    txres = await token.approve(actors.someone1, 0, {from: actors.owner});
    assert.equal(txres.logs[0].event, 'Approval');
    assert.equal(txres.logs[0].args.owner, actors.owner);
    assert.equal(txres.logs[0].args.spender, actors.someone1);
    assert.equal(txres.logs[0].args.value, 0);
    assert.equal(await token.allowance.call(actors.owner, actors.someone1), '0');

    // check transferFrom not from owner
    approve = new BigNumber(tokens('1e5'));
    transfer = approve.div(2);
    txres = await token.approve(actors.someone1, approve.toString(), {from: actors.someone2});
    assert.equal(txres.logs[0].event, 'Approval');
    assert.equal(txres.logs[0].args.owner, actors.someone2);
    assert.equal(txres.logs[0].args.spender, actors.someone1);
    assert.equal(txres.logs[0].args.value, approve.toString());
    assert.equal(await token.allowance.call(actors.someone2, actors.someone1), approve.toString());

    // cannot transfer more than allowed
    await assertEvmThrows(token.transferFrom(actors.someone2, actors.owner, approve.add(1), {from: actors.someone1}));

    // check transferFrom
    txres = await token.transferFrom(actors.someone2, actors.owner, transfer.toString(), {from: actors.someone1});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.someone2);
    assert.equal(txres.logs[0].args.to, actors.owner);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    assert.equal(await token.allowance.call(actors.someone2, actors.someone1), approve.sub(transfer).toString());

    // check balances
    state.someone2TokenBalance = state.someone2TokenBalance.sub(transfer);
    state.ownerTokenBalance = state.ownerTokenBalance.add(transfer);
    assert.equal(await token.balanceOf.call(actors.owner), state.ownerTokenBalance.toString());
    assert.equal(await token.balanceOf.call(actors.someone1), state.someone1TokenBalance.toString()); // not changed
    assert.equal(await token.balanceOf.call(actors.someone2), state.someone2TokenBalance.toString());
  });

  it('should be not payable', async () => {
    const token = await IonChain.deployed();
    await assertEvmThrows(token.sendTransaction({value: tokens('1'), from: actors.owner}));
    await assertEvmThrows(token.sendTransaction({value: tokens('1'), from: actors.someone1}));
  });

  it('should ico contract deployed', async () => {
    const token = await IonChain.deployed();
    Ico = await IonChainICO.new(
        token.address,
        actors.teamWallet,
        actors.tokenHolder,
        new BigNumber('0'), // low cap
        new BigNumber('16e20'), // hard cap
        new BigNumber('1e17'), // min tx cap 0.1 eth
        new BigNumber('16e20'), // hard tx cap
        {
          from: actors.owner
        }
    );
    state.teamWalletInitialBalance =
        state.teamWalletBalance = await web3.eth.getBalance(actors.teamWallet);
    assert.equal(await Ico.token.call(), token.address);
    assert.equal(await Ico.teamWallet.call(), actors.teamWallet);
    assert.equal(await Ico.tokenHolder.call(), actors.tokenHolder);
    assert.equal((await Ico.lowCapWei.call()).toString(), new BigNumber('0').toString());
    assert.equal((await Ico.hardCapWei.call()).toString(), new BigNumber('16e20').toString());
    assert.equal((await Ico.lowCapTxWei.call()).toString(), new BigNumber('1e17').toString());
    assert.equal((await Ico.hardCapTxWei.call()).toString(), new BigNumber('16e20').toString());

    // Check ico state
    assert.equal(await Ico.state.call(), ICOState.Inactive);
  });

  it('check whitelist access', async () => {
    assert.isTrue(Ico != null);
    const ico = Ico!!;

    await assertEvmThrows(ico.disableWhitelist({from: actors.someone1}));
    await assertEvmThrows(ico.whitelist(actors.someone1, {from: actors.someone1}));
    await ico.disableWhitelist({from: actors.owner});
    await ico.enableWhitelist({from: actors.owner});
  });

  it('ICO lifecycle: start', async () => {
    const token = await IonChain.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    assert.equal(await ico.state.call(), ICOState.Inactive);

    // ICO will end in 1 week
    const endAt = web3LatestTime() + Seconds.weeks(1);
    // tokenHolder must have more than 200M tokens
    await assertEvmThrows(ico.start(endAt, {from: actors.owner}));

    const transfer = new BigNumber(tokens('2e8')); // 200M IONC
    let txres = await token.transfer(actors.tokenHolder, transfer.toString(), {from: actors.owner});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.owner);
    assert.equal(txres.logs[0].args.to, actors.tokenHolder);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    // check balances
    state.ownerTokenBalance = state.ownerTokenBalance.sub(transfer);
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.add(transfer);
    assert.equal(await token.balanceOf.call(actors.owner), state.ownerTokenBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());

    // tokenHolder must approve for ico contract more than 200M tokens
    await assertEvmThrows(ico.start(endAt, {from: actors.owner}));

    txres = await token.approve(ico.address, transfer.toString(), {from: actors.tokenHolder});
    assert.equal(txres.logs[0].event, 'Approval');
    assert.equal(txres.logs[0].args.owner, actors.tokenHolder);
    assert.equal(txres.logs[0].args.spender, ico.address);
    assert.equal(txres.logs[0].args.value, transfer.toString());
    assert.equal(await token.allowance.call(actors.tokenHolder, ico.address), transfer.toString());

    await ico.start(endAt, {from: actors.owner});
    assert.equal(await ico.state.call(), ICOState.Active);
    assert.equal(await ico.endAt.call(), endAt);

    // Check link
    assert.equal(await ico.token.call(), token.address);
  });

  it('ICO lifecycle: invest', async () => {
    const token = await IonChain.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;

    assert.equal(await ico.state.call(), ICOState.Active);

    // Check link
    assert.equal(await ico.token.call(), token.address);

    // Perform investments (investor1)
    let investor1Tokens = new BigNumber(0);
    const balance = web3.eth.getBalance(actors.investor1);
    assert.equal(balance.toString(), new BigNumber('100e18').toString());

    // Check deny not white-listed addresses
    const invest1 = tokens2wei(12500);
    await assertEvmThrows(
        ico.sendTransaction({
                              value: invest1,
                              from: actors.investor1
                            })
    );

    // Add investor1 to white-list
    await ico.whitelist(actors.investor1);
    // Now it can buy tokens
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.sub(tokens(12500));
    let txres = await ico.sendTransaction({
                                            value: invest1,
                                            from: actors.investor1
                                          });
    state.sentWei = state.sentWei.add(invest1);
    state.investor1Wei = state.investor1Wei.add(invest1);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest1);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(
        new BigNumber(txres.logs[0].args.tokens).toString(),
        wei2rawtokens(txres.logs[0].args.investedWei)
    );
    investor1Tokens = investor1Tokens.add(txres.logs[0].args.tokens);
    assert.equal(await token.balanceOf.call(actors.investor1), txres.logs[0].args.tokens.toString());
    assert.equal(await token.balanceOf.call(actors.investor1), investor1Tokens.toString());

    state.teamWalletBalance = state.teamWalletBalance.add(invest1);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());

    // Add investor2 to white-list
    await ico.whitelist(actors.investor2);
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.sub(tokens(25000));
    const invest2 = tokens2wei(25000);
    txres = await ico.buyTokens({
                                  value: invest2,
                                  from: actors.investor2
                                });
    state.sentWei = state.sentWei.add(invest2);
    state.investor2Wei = state.investor2Wei.add(invest2);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest2);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(
        new BigNumber(txres.logs[0].args.tokens).toString(),
        wei2rawtokens(txres.logs[0].args.investedWei)
    );
    assert.equal(await token.balanceOf.call(actors.investor2), txres.logs[0].args.tokens.toString());

    state.teamWalletBalance = state.teamWalletBalance.add(invest2);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());
  });

  it('ICO lifecycle: invest reach personal cap', async () => {
    const token = await IonChain.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;

    assert.equal(await ico.state.call(), ICOState.Active);

    // Check link
    assert.equal(await ico.token.call(), token.address);

    // Perform investments (investor3)
    let investor3Tokens = new BigNumber(0);
    const balance = web3.eth.getBalance(actors.investor3);
    assert.equal(balance.toString(), new BigNumber('100e18').toString());

    // Check deny not white-listed addresses
    const invest3 = tokens2wei(100000); // 1.6 Ether * 125000 / 2
    await assertEvmThrows(
        ico.sendTransaction({
                              value: invest3,
                              from: actors.investor3
                            })
    );

    // Add investor3 to white-list
    await ico.whitelist(actors.investor3);
    // Now it can buy tokens
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.sub(tokens(100000));
    let txres = await ico.sendTransaction({
                                            value: invest3,
                                            from: actors.investor3
                                          });
    state.sentWei = state.sentWei.add(invest3);
    state.investor3Wei = state.investor3Wei.add(invest3);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest3);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(
        new BigNumber(txres.logs[0].args.tokens).toString(),
        wei2rawtokens(txres.logs[0].args.investedWei)
    );
    investor3Tokens = investor3Tokens.add(txres.logs[0].args.tokens);
    assert.equal(await token.balanceOf.call(actors.investor3), txres.logs[0].args.tokens.toString());
    assert.equal(await token.balanceOf.call(actors.investor3), investor3Tokens.toString());

    state.teamWalletBalance = state.teamWalletBalance.add(invest3);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());

    // again
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.sub(tokens(100000));
    txres = await ico.sendTransaction({
                                            value: invest3,
                                            from: actors.investor3
                                          });
    state.sentWei = state.sentWei.add(invest3);
    state.investor3Wei = state.investor3Wei.add(invest3);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest3);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(
        new BigNumber(txres.logs[0].args.tokens).toString(),
        wei2rawtokens(txres.logs[0].args.investedWei)
    );
    investor3Tokens = investor3Tokens.add(txres.logs[0].args.tokens);
    assert.equal(await token.balanceOf.call(actors.investor3), investor3Tokens.toString());

    state.teamWalletBalance = state.teamWalletBalance.add(invest3);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());

    // no more than 1.6 Ether in first 48 hours
    await assertEvmThrows(ico.sendTransaction({
                                        value: invest3,
                                        from: actors.investor3
                                      }));

    const personalCapEndAt = new BigNumber(await ico.personalCapEndAt.call()).toNumber();
    await web3IncreaseTimeTo(personalCapEndAt - Seconds.minutes(1));

    await assertEvmThrows(ico.sendTransaction({
                                                value: invest3,
                                                from: actors.investor3
                                              }));

    await web3IncreaseTimeTo(personalCapEndAt + 1);

    // now is ok
    state.tokenHolderTokenBalance = state.tokenHolderTokenBalance.sub(tokens(100000));
    txres = await ico.sendTransaction({
                                        value: invest3,
                                        from: actors.investor3
                                      });
    state.sentWei = state.sentWei.add(invest3);
    state.investor3Wei = state.investor3Wei.add(invest3);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest3);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(
        new BigNumber(txres.logs[0].args.tokens).toString(),
        wei2rawtokens(txres.logs[0].args.investedWei)
    );
    investor3Tokens = investor3Tokens.add(txres.logs[0].args.tokens);
    assert.equal(await token.balanceOf.call(actors.investor3), investor3Tokens.toString());

    state.teamWalletBalance = state.teamWalletBalance.add(invest3);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());
  });

  it('ICO lifecycle: complete', async () => {
    const token = await IonChain.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    assert.equal(await ico.state.call(), ICOState.Active);

    // tuning ICO: check access
    await ico.suspend({from: actors.owner});
    assert.equal(await ico.state.call(), ICOState.Suspended);

    // only owner can tune
    await assertEvmThrows(ico.tune(0, 0, new BigNumber('161e19'), 0, 0, {from: actors.someone1}));
    await ico.tune(0, 0, new BigNumber('161e19'), 0, 0, {from: actors.owner});

    // check that only hard cap changed
    assert.equal(await ico.token.call(), token.address);
    assert.equal(await ico.teamWallet.call(), actors.teamWallet);
    assert.equal((await ico.lowCapWei.call()).toString(), new BigNumber('0').toString());
    assert.equal((await ico.hardCapWei.call()).toString(), new BigNumber('161e19').toString());
    assert.equal((await ico.lowCapTxWei.call()).toString(), new BigNumber('1e17').toString());
    assert.equal((await ico.hardCapTxWei.call()).toString(), new BigNumber('16e20').toString());

    assert.equal(await ico.state.call(), ICOState.Suspended);

    await ico.resume({from: actors.owner});
    assert.equal(await ico.state.call(), ICOState.Active);

    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(await token.balanceOf.call(actors.tokenHolder), state.tokenHolderTokenBalance.toString());

    assert.equal(new BigNumber(await ico.collectedWei.call()).toString(), state.sentWei.toString());
    assert.equal(await ico.state.call(), ICOState.Active);

    const endAt = new BigNumber(await ico.endAt.call()).toNumber();
    await web3IncreaseTimeTo(endAt + 1);
    await ico.touch({from: actors.someone1});
    assert.equal(await ico.state.call(), ICOState.Completed);
  });

  it('Should team wallet match invested funds after ico', async () => {
    assert.equal(
        new BigNumber(web3.eth.getBalance(actors.teamWallet)).sub(state.teamWalletInitialBalance).toString(),
        state.sentWei.toString()
    );

    assert.equal(state.investor1Wei
                     .add(state.investor2Wei)
                     .add(state.investor3Wei).toString(), state.sentWei.toString());
  });
});
