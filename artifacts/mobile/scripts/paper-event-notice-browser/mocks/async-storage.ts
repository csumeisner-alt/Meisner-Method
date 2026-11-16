const prefix = '__async_storage__:';

declare global {
  interface Window {
    __paperEventNoticeStorageReads?: string[];
  }
}

const AsyncStorage = {
  async getItem(key: string) {
    window.__paperEventNoticeStorageReads ??= [];
    window.__paperEventNoticeStorageReads.push(key);
    return window.localStorage.getItem(`${prefix}${key}`);
  },
  async setItem(key: string, value: string) {
    window.localStorage.setItem(`${prefix}${key}`, value);
  },
};

export default AsyncStorage;
