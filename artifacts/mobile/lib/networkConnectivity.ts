export type NetworkConnectivityState = {
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

export function isNetworkOffline(state: NetworkConnectivityState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

export function didNetworkReconnect(
  wasOffline: boolean | null,
  isOffline: boolean,
): boolean {
  return wasOffline === true && !isOffline;
}
