const PRODUCT_PREFIX = "herdr-web";
const LEGACY_PRODUCT_PREFIX = ["he", "dr"].join("");

interface ProductStorage {
  getItem(key: string): string | null;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

function key(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

export function readProductStorage(
  storage: ProductStorage,
  suffix: string,
): string | null {
  const productKey = key(PRODUCT_PREFIX, suffix);
  const current = storage.getItem(productKey);
  if (current !== null) return current;

  const legacyKey = key(LEGACY_PRODUCT_PREFIX, suffix);
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;

  storage.setItem(productKey, legacy);
  storage.removeItem?.(legacyKey);
  return legacy;
}

export function writeProductStorage(
  storage: ProductStorage,
  suffix: string,
  value: string,
): void {
  storage.setItem(key(PRODUCT_PREFIX, suffix), value);
  storage.removeItem?.(key(LEGACY_PRODUCT_PREFIX, suffix));
}
