'use client';

import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import * as cartLib from '@/lib/cart';
import * as cartStorage from '@/lib/cartStorage';

const CartContext = createContext(null);

const SSR_SNAPSHOT = cartLib.emptyCart();

export function CartProvider({ children }) {
  // useSyncExternalStore subscribes to localStorage via the `storage` event
  // (cross-tab updates). For same-tab writes we notify listeners manually.
  const listenersRef = useRef(new Set());

  const subscribe = useCallback((onStoreChange) => {
    listenersRef.current.add(onStoreChange);
    const unsubscribeStorage = cartStorage.subscribe(onStoreChange);
    return () => {
      listenersRef.current.delete(onStoreChange);
      unsubscribeStorage();
    };
  }, []);

  const getSnapshot = useCallback(() => cartStorage.readCart(), []);
  const getServerSnapshot = useCallback(() => SSR_SNAPSHOT, []);

  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const mutate = useCallback((next) => {
    cartStorage.writeCart(next);
    // Notify all in-tab subscribers (the storage event won't fire in this tab)
    listenersRef.current.forEach((cb) => cb());
  }, []);

  const addItem = useCallback(
    (item) => mutate(cartLib.addItem(cartStorage.readCart(), item)),
    [mutate],
  );
  const removeItem = useCallback(
    (sku) => mutate(cartLib.removeItem(cartStorage.readCart(), sku)),
    [mutate],
  );
  const setQty = useCallback(
    (sku, qty) => mutate(cartLib.setQty(cartStorage.readCart(), sku, qty)),
    [mutate],
  );
  const clearCart = useCallback(() => mutate(cartLib.clearCart(cartStorage.readCart())), [mutate]);

  const value = { cart, addItem, removeItem, setQty, clearCart };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    // Tolerate unmounted-provider usage during SSR / tests by returning a read-only empty cart.
    return {
      cart: SSR_SNAPSHOT,
      addItem: () => {},
      removeItem: () => {},
      setQty: () => {},
      clearCart: () => {},
    };
  }
  return ctx;
}
