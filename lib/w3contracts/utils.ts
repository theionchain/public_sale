import {ICOState} from "../../contracts";

export function toIcoStateIdToName(val: BigNumber.BigNumber): string {
  switch (val.toNumber()) {
    case ICOState.Inactive:
      return 'Inactive';
    case ICOState.Active:
      return 'Active';
    case ICOState.Suspended:
      return 'Suspended';
    case ICOState.Terminated:
      return 'Terminated';
    case ICOState.NotCompleted:
      return 'NotCompleted';
    case ICOState.Completed:
      return 'Completed';
    default:
      throw new Error(`Unknown ico state: ${val}`);
  }
}
