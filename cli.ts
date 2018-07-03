global.Promise = require('bluebird');
import Ajv = require('ajv');
import fs = require('fs');
import net = require('net');
import path = require('path');
import {Strings} from './lib/utils';
import * as Web3 from 'web3';
import {address, IContract} from './globals';
import {IIonChain, IIonChainICO} from './contracts';
import {toIcoStateIdToName} from "./lib/w3contracts/utils";
import {ICliConfig} from './cli.schema';
import * as BigNumber from 'bignumber.js';
import moment = require('moment');
import readline = require('readline');

const ONE_TOKEN = new BigNumber('1e6');

type ContractName = 'IonChain' | 'IonChainICO';

const ctx = {
  contractNames: ['IonChain', 'IonChainICO'],
  cmdOpts: new Array<string>(),
  verbose: false,
  cfile: 'cli.yml',
  IonChain: {},
  IonChainICO: {}
} as {
  contractNames: string[];
  cmd: string;
  cmdOpts: string[];
  cfile: string;
  cfg: ICliConfig;
  verbose: boolean;
  web3: Web3;
  provider: Web3.providers.Provider;
  IonChain: {
    meta: IContract<IIonChain>;
    instance: IIonChain;
  };
  IonChainICO: {
    meta: IContract<IIonChainICO>;
    instance: IIonChainICO;
  };
};

const rl = readline.createInterface({
                                      input: process.stdin,
                                      output: process.stdout
                                    });

const handlers = {} as {
  [k: string]: () => Promise<void>;
};

async function setup() {
  const TruffleContract = require('truffle-contract');
  loadConfig(ctx.cfile);
  await setupWeb3();
  await loadDeployedContracts();

  async function loadDeployedContracts() {
    const ecfg = ctx.cfg.ethereum;
    const w3defaults = {
      from: ecfg.from,
      gas: ecfg.gas,
      gasPrice: ecfg.gasPrice
    };
    return Promise.mapSeries(ctx.contractNames, async cn => {
      if (!ecfg[cn]) {
        return;
      }
      const c = ctx as any;
      c[cn].meta = TruffleContract(JSON.parse(fs.readFileSync(ecfg[cn].schema).toString()));
      c[cn].meta.setProvider(ctx.web3.currentProvider);
      c[cn].meta.defaults(w3defaults);
      c[cn].meta.synchronization_timeout = 0;
      const addr = readDeployedContractAddress(cn);
      if (addr) {
        c[cn].instance = await c[cn].meta.at(addr);
        console.log(`Loaded ${cn} instance at: ${addr}`);
      }
    });
  }

  async function setupWeb3() {
    const ecfg = ctx.cfg.ethereum;
    const endpoint = ecfg.endpoint.trim();
    if (endpoint.startsWith('ipc://')) {
      console.log(`Using Web3.providers.IpcProvider for ${endpoint}`);
      ctx.provider = new Web3.providers.IpcProvider(endpoint.substring('ipc://'.length), net);
    } else if (endpoint.startsWith('http')) {
      console.log(`Using Web3.providers.HttpProvider provider for: ${endpoint}`);
      ctx.provider = new Web3.providers.HttpProvider(endpoint);
    } else {
      throw new Error(`Unknown web3 endpoint: '${endpoint}'`);
    }
    ctx.web3 = new Web3(ctx.provider);
    await Promise.fromNode(cb => {
      ctx.web3.version.getNode((err, node) => {
        if (err) {
          cb(err);
          return;
        }
        console.log(`web3 node: ${node}`);
        cb(err, node);
      });
    });
    await Promise.fromNode(cb => {
      ctx.web3.version.getNetwork((err, netId) => {
        if (err) {
          cb(err);
          return;
        }
        switch (netId) {
          case '1':
            console.log('w3 connected to >>>> MAINNET <<<<');
            break;
          case '2':
            console.log('w3 connected to >>>> MORDEN <<<<');
            break;
          case '3':
            console.log('w3 connected to >>>> ROPSTEN <<<<');
            break;
          default:
            console.log('w3 connected to >>>> UNKNOWN <<<<');
        }
        cb(err, netId);
      });
    });
  }

  function loadConfig(cpath: string) {
    const ajv = new Ajv();
    const configSchema = require('./cli.schema.json');
    const yaml = require('js-yaml');
    const subst = {
      home: process.env['HOME'],
      cwd: process.cwd(),
      moduledir: __dirname
    };
    ctx.cfg = yaml.safeLoad(Strings.replaceTemplate(fs.readFileSync(cpath, 'utf8'), subst));
    if (!ajv.validate(configSchema, ctx.cfg)) {
      const msg = `env: Invalid configuration: ${cpath}: `;
      console.error(msg, ajv.errors);
      throw new Error(`Invalid configuration: ${cpath}`);
    }
    if (ctx.verbose) {
      console.log('Configuration ', JSON.stringify(ctx.cfg, null, 2));
    }
  }
}

function readDeployedContractAddress(contract: string): string | null {
  const p = path.join(ctx.cfg.ethereum.lockfilesDir, `${contract}.lock`);
  if (fs.existsSync(p)) {
    return fs.readFileSync(p).toString('utf8');
  } else {
    return null;
  }
}

function writeDeployedContractAddress(contract: string, addr: address) {
  const p = path.join(ctx.cfg.ethereum.lockfilesDir, `${contract}.lock`);
  fs.writeFileSync(p, addr);
}

function failIfDeployed(cname?: ContractName) {
  const c = ctx as any;
  if (cname) {
    if (c[cname].instance) {
      throw new Error(`Contract '${cname}' is already deployed`);
    }
  } else {
    ctx.contractNames.forEach(cn => failIfDeployed(cn as any));
  }
}

function failIfNotDeployed(cname?: ContractName) {
  const c = ctx as any;
  if (cname) {
    if (!c[cname].instance) {
      throw new Error(`Contract '${cname}' is not deployed`);
    }
  } else {
    ctx.contractNames.forEach(cn => failIfNotDeployed(cn as any));
  }
}

function checkEthNetwork(): Promise<void> {
  return new Promise((resolve, reject) => {
    // try synchronous call
    let syncing: boolean | Web3.SyncingResult;
    try {
      syncing = ctx.web3.eth.syncing;
    } catch (err) {
      // async request
      ctx.web3.eth.getSyncing((err: any, sync: boolean | Web3.SyncingResult) => {
        if (err) {
          reject(err);
          return;
        }
        if (sync) {
          reject('Ethereum network client in pending synchronization, try again later');
        } else {
          resolve();
        }
      });
      return;
    }
    if (syncing) {
      reject('Ethereum network client in pending synchronization, try again later');
      return;
    }
    resolve();
  });
}

function confirm(question: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rl.question(question + " (YES/no) ", (answer) => {
      if (answer === 'YES') {
        resolve();
      } else {
        reject();
      }
      rl.close();
    });
  });
}

// -------------------- Operations

/**
 * Deploy
 */
handlers['deploy'] = async () => {
  await checkEthNetwork();
  let icfg = null;
  if (!ctx.IonChain.instance) {
    icfg = ctx.cfg.ethereum.IonChain;
    console.log(`Deployment: 'IonChain' `, icfg);
    ctx.IonChain.instance = await ctx.IonChain.meta.new(
        icfg.totalSupplyTokens,
        {
          from: ctx.cfg.ethereum.from
        }
    );
    console.log(`IonChain successfully deployed at: ${ctx.IonChain.instance.address}\n\n`);
    writeDeployedContractAddress('IonChain', ctx.IonChain.instance.address);
  }
  if (!ctx.IonChainICO.instance) {
    icfg = ctx.cfg.ethereum.IonChainICO;
    if (!!icfg) {
      console.log(`Deployment: 'IonChainICO' `, icfg);
      ctx.IonChainICO.instance = await ctx.IonChainICO.meta.new(
          ctx.IonChain.instance.address,
          icfg.teamWallet,
          icfg.tokenHolder,
          icfg.lowCapWei,
          icfg.hardCapWei,
          icfg.lowCapTxWei,
          icfg.hardCapWei,
          {
            from: ctx.cfg.ethereum.from
          }
      );
      console.log(`IonChainICO successfully deployed at: ${ctx.IonChainICO.instance.address}\n\n`);
      writeDeployedContractAddress('IonChainICO', ctx.IonChainICO.instance.address);
    } else {
      console.warn(`IonChainICO not configured. Skipped`);
    }
  }
};

/**
 * Show status info
 */
handlers['status'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('IonChain');
  const token = ctx.IonChain.instance;
  const data = {};
  (<any>data)['token'] = {
    address: token.address,
    owner: await token.owner.call(),
    symbol: await token.symbol.call(),
    totalSupply: await token.totalSupply.call(),
    locked: await token.locked.call()
  };
  const c = ctx as any;
  if (c['IonChainICO'].instance) {
    const ico = ctx.IonChainICO.instance;
    (<any>data)['ico'] = {
      address: ico.address,
      owner: await ico.owner.call(),
      teamWallet: await ico.teamWallet.call(),
      tokenHolder: await ico.tokenHolder.call(),
      state: toIcoStateIdToName((await ico.state.call()) as any),
      weiCollected: await ico.collectedWei.call(),
      lowCapWei: await ico.lowCapWei.call(),
      hardCapWei: await ico.hardCapWei.call(),
      lowCapTxWei: await ico.lowCapTxWei.call(),
      hardCapTxWei: await ico.hardCapTxWei.call()
    };
  }
  console.log(JSON.stringify(data, null, 2));
};

handlers['token'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('IonChain');
  const token = ctx.IonChain.instance;
  const wcmd = ctx.cmdOpts.shift();
  switch (wcmd) {
    case 'balance': {
      const tokensWithDecimals = await token.balanceOf.call(pullCmdArg('address'));
      const data = {
        tokens: new BigNumber(tokensWithDecimals).divToInt(ONE_TOKEN),
        tokensWithDecimals
      };
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'lock':
      await token.lock();
      console.log({locked: await token.locked.call()});
      break;
    case 'unlock':
      await token.unlock();
      console.log({locked: await token.locked.call()});
      break;
    case 'locked':
      console.log({locked: await token.locked.call()});
      break;
    case 'approve':
      await token.approve(pullCmdArg('address'), new BigNumber(pullCmdArg('amount')).mul(ONE_TOKEN));
      break;
    case 'allowance':
      const tokensWithDecimals1 = await token.allowance.call(pullCmdArg('address1'), pullCmdArg('address2'));
      const data1 = {
        tokens: new BigNumber(tokensWithDecimals1).divToInt(ONE_TOKEN),
        tokensWithDecimals: tokensWithDecimals1
      };
      console.log(JSON.stringify(data1, null, 2));
      break;
    default:
      throw new Error(`Unknown token sub-command: ${wcmd || ''}`);
  }
};

handlers['ico'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('IonChain');
  failIfNotDeployed('IonChainICO');
  const ico = ctx.IonChainICO.instance;
  const wcmd = ctx.cmdOpts.shift();
  let end = null;
  switch (wcmd) {
    case 'state':
      console.log({
                    status: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'start':
      end = moment.utc(pullCmdArg('end'));
      if (!end.unix() || end.isBefore(moment().utc())) {
        throw new Error('End date is before current time');
      }
      console.log(`Starting ICO. End ts: ${end.unix()} sec`);
      await ico.start(end.unix());
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'suspend':
      await ico.suspend();
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'resume':
      await ico.resume();
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'touch':
      await ico.touch();
      console.log({
                    status: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'owner':
      await ico.transferOwnership(pullCmdArg('address'));
      break;
    case 'tune':
      end = moment.utc(pullCmdArg('end'));
      const lowcap = pullCmdArg('lowcap');
      const hardcap = pullCmdArg('hardcap');
      if (!end.unix() || end.isBefore(moment().utc())) {
        throw new Error('End date is before current time');
      }
      console.log(`IonChainICO end ts: ${end.unix()} sec`);
      await ico.tune(end.unix(), new BigNumber(lowcap), new BigNumber(hardcap), 0, 0);
      const data = {};
      (<any>data) = {
        address: ico.address,
        owner: await ico.owner.call(),
        teamWallet: await ico.teamWallet.call(),
        state: toIcoStateIdToName((await ico.state.call()) as any),
        weiCollected: await ico.collectedWei.call(),
        lowCapWei: await ico.lowCapWei.call(),
        hardCapWei: await ico.hardCapWei.call(),
        lowCapTxWei: await ico.lowCapTxWei.call(),
        hardCapTxWei: await ico.hardCapTxWei.call()
      };
      console.log(JSON.stringify(data, null, 2));
      break;
    default:
      throw new Error(`Unknown ico sub-command: ${wcmd || ''}`);
  }
};

handlers['wl'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('IonChainICO');
  const ico = ctx.IonChainICO.instance;
  const wcmd = ctx.cmdOpts.shift();
  switch (wcmd) {
    case 'status': {
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'add': {
      await ico.whitelist(pullCmdArg('address'));
      console.log('Success');
      break;
    }
    case 'remove': {
      await ico.blacklist(pullCmdArg('address'));
      console.log('Success');
      break;
    }
    case 'disable': {
      await ico.disableWhitelist();
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'enable': {
      await ico.enableWhitelist();
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'is': {
      const addr = pullCmdArg('address');
      console.log({
                    address: addr,
                    whitelisted: await ico.whitelisted.call(addr)
                  });
      break;
    }
    default:
      throw new Error(`Unknown whitelist sub-command: ${wcmd || ''}`);
  }
};
// --------------------- Helpers

function pullCmdArg(name: string): address {
  const arg = ctx.cmdOpts.shift();
  if (!arg) {
    throw new Error(`Missing required ${name} argument for command`);
  }
  return arg;
}

// -------------------- Run

// Parse options
(function () {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; ++i) {
    const av = (args[i] = args[i].trim());
    if (av.charAt(0) !== '-') {
      if (ctx.cmd) {
        usage(`Command '${ctx.cmd}' already specified`);
      }
      ctx.cmd = av;
      ctx.cmdOpts = args.slice(i + 1);
      break;
    }
    if (av === '-h' || av === '--help') {
      usage();
    }
    if (av === '-v' || av === '--verbose') {
      ctx.verbose = true;
    }
    if (av === '-c' || av === '--config') {
      ctx.cfile = args[++i] || usage(`Missing '-c|--config' option value`);
    }
  }
  if (!ctx.cmd) {
    usage('No command specified');
  }
  if (!handlers[ctx.cmd]) {
    usage(`Invalid command specified: '${ctx.cmd}'`);
  }
  console.log(`Command: ${ctx.cmd} opts: `, ctx.cmdOpts);
})();

function usage(error?: string): never {
  console.error(
      'Usage: \n\tnode cli.js' +
      '\n\t[-c|--config <config yaml file>]' +
      '\n\t[-v|--verbose]' +
      '\n\t[-h|--help]' +
      '\n\t<command> [command options]' +
      '\nCommands:' +
      '\n\tdeploy                                - Deploy Ionc token and ICO smart contracts' +
      '\n\tstatus                                - Get contracts status' +
      '\n\tico state                             - Get ico state' +
      '\n\tico start <end>                       - Start ICO (format: \'YYYY-MM-DD HH:mm\', UTC+0)' +
      '\n\tico touch                             - Touch ICO. Recalculate ICO state based on current block time.' +
      '\n\tico suspend                           - Suspend ICO (only if ICO is Active)' +
      '\n\tico resume                            - Resume ICO (only if ICO is Suspended)' +
      '\n\tico tune <end> <lowcap> <hardcap>     - Set end date/low-cap/hard-cap for ICO (Only in suspended state)' +
      '\n\ttoken balance <addr>                  - Get token balance for address' +
      '\n\ttoken lock                            - Lock token contract (no token transfers are allowed)' +
      '\n\ttoken unlock                          - Unlock token contract' +
      '\n\ttoken locked                          - Get token lock status' +
      '\n\twl status                             - Check if whitelisting enabled' +
      '\n\twl add <addr>                         - Add <addr> to ICO whitelist' +
      '\n\twl remove <addr>                      - Remove <addr> from ICO whitelist' +
      '\n\twl disable                            - Disable address whitelisting for ICO' +
      '\n\twl enable                             - Enable address whitelisting for ICO' +
      '\n\twl is <addr>                          - Check if given <addr> in whitelist' +
      '\n' +
      '\n\t\t <addr> - Ethereum address' +
      '\n'
  );
  if (error) {
    console.error(error);
    process.exit(1);
  }
  process.exit();
  throw Error();
}

// Start
setup()
    .then(handlers[ctx.cmd])
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      if (err) {
        console.error(err);
      }
      process.exit(1);
    });
