/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {timeout} from '@angular/private/testing';
import {
  ApplicationRef,
  Component,
  effect,
  inject,
  Injectable,
  Injector,
  resource,
  signal,
} from '../../src/core';
import {TestBed} from '../../testing';

describe('resource() with `lifetime: "refCounted"`', () => {
  let injector: Injector;
  let appRef: ApplicationRef;

  beforeEach(() => {
    injector = TestBed.inject(Injector);
    appRef = TestBed.inject(ApplicationRef);
  });

  /** A resource whose loader records every call and every abort. */
  function setup(opts: {keepAliveMs?: number; resolve?: boolean} = {}) {
    const calls: number[] = [];
    const aborted: number[] = [];
    const params = signal(1);
    const res = resource({
      params,
      lifetime: 'refCounted',
      keepAliveMs: opts.keepAliveMs ?? 10,
      injector,
      loader: ({params, abortSignal}) => {
        calls.push(params);
        abortSignal.addEventListener('abort', () => aborted.push(params));
        return opts.resolve === false
          ? new Promise<number>(() => {})
          : Promise.resolve(params * 10);
      },
    });
    return {res, calls, aborted, params};
  }

  /** A live consumer of `read`, like a template would be. */
  function liveReader(read: () => unknown) {
    return effect(() => void read(), {injector});
  }

  it('should stay idle and not load while nothing live reads it', async () => {
    const {res, calls} = setup();
    TestBed.tick();

    // Imperative reads are not references.
    expect(res.status()).toBe('idle');
    expect(res.value()).toBeUndefined();
    await appRef.whenStable();
    expect(calls).toEqual([]);
  });

  it('should load once the first live consumer reads it and share the load with later ones', async () => {
    const {res, calls} = setup();
    liveReader(() => res.value());
    liveReader(() => res.status());
    TestBed.tick();

    expect(res.status()).toBe('loading');
    await appRef.whenStable();

    expect(res.status()).toBe('resolved');
    expect(res.value()).toBe(10);
    expect(calls).toEqual([1]);
  });

  it('should keep its state while one consumer leaves and another arrives within keepAliveMs', async () => {
    const {res, calls} = setup({keepAliveMs: 20});
    const first = liveReader(() => res.value());
    TestBed.tick();
    await appRef.whenStable();

    first.destroy();
    await timeout(5);
    liveReader(() => res.value());
    TestBed.tick();
    await timeout(30);

    expect(res.value()).toBe(10);
    expect(calls).toEqual([1]);
  });

  it('should release its state keepAliveMs after the last live consumer is gone, and load again on the next one', async () => {
    const {res, calls} = setup();
    const reader = liveReader(() => res.value());
    TestBed.tick();
    await appRef.whenStable();
    expect(res.value()).toBe(10);

    reader.destroy();
    await timeout(15);

    expect(res.status()).toBe('idle');
    expect(res.value()).toBeUndefined();

    liveReader(() => res.value());
    TestBed.tick();
    await appRef.whenStable();

    expect(res.status()).toBe('resolved');
    expect(res.value()).toBe(10);
    expect(calls).toEqual([1, 1]);
  });

  it('should abort an in-flight load and settle app stability when released', async () => {
    const {res, aborted} = setup({resolve: false});
    const reader = liveReader(() => res.value());
    TestBed.tick();
    expect(res.status()).toBe('loading');

    reader.destroy();
    await timeout(15);

    expect(aborted).toEqual([1]);
    expect(res.status()).toBe('idle');
    await appRef.whenStable();
  });

  it('should ignore params changes while released and use the current params on the next load', async () => {
    const {res, calls, params} = setup();
    const reader = liveReader(() => res.value());
    TestBed.tick();
    await appRef.whenStable();

    reader.destroy();
    await timeout(15);
    params.set(2);
    TestBed.tick();
    expect(calls).toEqual([1]);

    liveReader(() => res.value());
    TestBed.tick();
    await appRef.whenStable();

    expect(res.value()).toBe(20);
    expect(calls).toEqual([1, 2]);
  });

  it('should by default survive a same-tick consumer switch, like a route change', async () => {
    const {res, calls} = setup({keepAliveMs: undefined});
    const res0 = resource({
      lifetime: 'refCounted',
      injector,
      loader: async () => {
        calls.push(0);
        return 0;
      },
    });
    const first = liveReader(() => res0.value());
    TestBed.tick();
    await appRef.whenStable();

    first.destroy();
    liveReader(() => res0.value());
    TestBed.tick();
    await timeout(5);

    expect(res0.value()).toBe(0);
    expect(calls).toEqual([0]);
    expect(res.status()).toBe('idle');
  });

  it('should reject a negative or non-finite keepAliveMs', () => {
    for (const keepAliveMs of [-1, NaN, Infinity]) {
      expect(() =>
        resource({lifetime: 'refCounted', keepAliveMs, injector, loader: async () => 0}),
      ).toThrowError(/keepAliveMs/);
    }
  });

  describe('read from a template', () => {
    @Injectable({providedIn: 'root'})
    class Store {
      calls = 0;
      readonly data = resource({
        lifetime: 'refCounted',
        keepAliveMs: 10,
        loader: async () => {
          this.calls++;
          return 'data';
        },
      });
    }

    @Component({template: '{{ store.data.status() }}:{{ store.data.value() ?? "-" }}'})
    class Reader {
      readonly store = inject(Store);
    }

    it('should load while a view shows it and release once the view is gone', async () => {
      const store = TestBed.inject(Store);
      const fixture = TestBed.createComponent(Reader);
      await fixture.whenStable();

      expect(fixture.nativeElement.textContent).toBe('resolved:data');
      expect(store.calls).toBe(1);

      fixture.destroy();
      await timeout(15);

      expect(store.data.status()).toBe('idle');

      const again = TestBed.createComponent(Reader);
      await again.whenStable();
      expect(again.nativeElement.textContent).toBe('resolved:data');
      expect(store.calls).toBe(2);
    });

    it('should share one load between two views', async () => {
      const store = TestBed.inject(Store);
      const a = TestBed.createComponent(Reader);
      const b = TestBed.createComponent(Reader);
      await a.whenStable();
      await b.whenStable();

      expect(a.nativeElement.textContent).toBe('resolved:data');
      expect(b.nativeElement.textContent).toBe('resolved:data');
      expect(store.calls).toBe(1);
    });
  });
});
