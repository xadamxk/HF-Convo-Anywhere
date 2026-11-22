/**
 * Using the page's Web Locks from a Firefox content script.
 *
 * There, `navigator.locks` is the page's LockManager, and it can't use what a
 * content script's own callback returns ("Permission denied to access
 * property 'then'"), so a lock is released the moment it's granted. The lock
 * callback has to be exported to the page (toPageRealm), and the promise it
 * returns to keep the lock has to be made in the page's realm
 * (pageRealmPromise). Elsewhere both are the plain function and an ordinary
 * promise.
 */

/** A function the page's code can call and use the result of (see above). */
export function toPageRealm<T extends (...args: any[]) => any>(fn: T): T {
  const scope = globalThis as any;
  return typeof scope.exportFunction === "function" && scope.window
    ? scope.exportFunction(fn, scope.window)
    : fn;
}

/** A promise the page's code can wait on, e.g. one that keeps a Web Lock until it settles. */
export function pageRealmPromise(
  executor: (resolve: () => void) => void
): Promise<void> {
  const scope = globalThis as any;
  const pagePromise = scope.window?.wrappedJSObject?.Promise;
  const exportFunction = scope.exportFunction;
  if (
    typeof pagePromise === "function" &&
    typeof exportFunction === "function"
  ) {
    return new pagePromise(
      exportFunction(
        (resolve: () => void) => executor(() => resolve()),
        scope.window
      )
    );
  }
  return new Promise<void>((resolve) => executor(() => resolve()));
}
