const storageKey = (key: string) => `__async_storage__:${key}`;

const AsyncStorage = {
  getItem: async (key: string) => window.localStorage.getItem(storageKey(key)),
  setItem: async (key: string, value: string) => window.localStorage.setItem(storageKey(key), value),
  removeItem: async (key: string) => window.localStorage.removeItem(storageKey(key)),
};

export default AsyncStorage;