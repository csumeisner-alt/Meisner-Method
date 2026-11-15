const prefix = '__async_storage__:';

const AsyncStorage = {
  async getItem(key: string) {
    return window.localStorage.getItem(`${prefix}${key}`);
  },
  async setItem(key: string, value: string) {
    window.localStorage.setItem(`${prefix}${key}`, value);
  },
  async removeItem(key: string) {
    window.localStorage.removeItem(`${prefix}${key}`);
  },
  async multiRemove(keys: string[]) {
    keys.forEach((key) => window.localStorage.removeItem(`${prefix}${key}`));
  },
};

export default AsyncStorage;
