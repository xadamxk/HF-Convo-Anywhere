import { pageRealmPromise, toPageRealm } from "./pageRealm";

describe("pageRealm", () => {
  const scope = globalThis as any;
  afterEach(() => {
    delete scope.exportFunction;
    delete (window as any).wrappedJSObject;
  });

  it("exports a callback to the page only in a Firefox content script", () => {
    const callback = () => 1;
    expect(toPageRealm(callback)).toBe(callback);
    const exported = () => 2;
    scope.exportFunction = (fn: unknown, target: unknown) =>
      fn === callback && target === window ? exported : null;
    expect(toPageRealm(callback)).toBe(exported);
  });

  it("is an ordinary promise outside a Firefox content script", async () => {
    let release!: () => void;
    const promise = pageRealmPromise((resolve) => (release = resolve));
    expect(promise).toBeInstanceOf(Promise);
    release();
    await expect(promise).resolves.toBeUndefined();
  });

  it("is made in the page's realm in a Firefox content script", async () => {
    class PagePromise<T> extends Promise<T> {}
    const exported: unknown[] = [];
    (window as any).wrappedJSObject = { Promise: PagePromise };
    scope.exportFunction = (fn: unknown, target: unknown) => {
      exported.push(target);
      return fn;
    };
    let release!: () => void;
    const promise = pageRealmPromise((resolve) => (release = resolve));

    expect(promise).toBeInstanceOf(PagePromise);
    expect(exported).toEqual([window]);
    release();
    await expect(promise).resolves.toBeUndefined();
  });
});
