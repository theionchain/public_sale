const IonChain = artifacts.require('./IonChain.sol');
export = function(deployer: any) {
  // Set unlimited synchronization timeout
  (<any>IonChain).constructor.synchronization_timeout = 0;
  deployer.deploy(IonChain, '1e9');
};
