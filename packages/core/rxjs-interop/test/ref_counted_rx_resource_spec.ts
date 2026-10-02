/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {timeout} from '@angular/private/testing';
import {Observable, of} from 'rxjs';
import {ApplicationRef, effect, Injector, signal} from '../../src/core';
import {TestBed} from '../../testing';
import {refCountedRxResource} from '../src';

describe('refCountedRxResource()', () => {
  let injector: Injector;
  let appRef: ApplicationRef;

  beforeEach(() => {
    injector = TestBed.inject(Injector);
    appRef = TestBed.inject(ApplicationRef);
  });

  function setup() {
    let subscriptions = 0;
    let unsubscriptions = 0;
    const params = signal(1);
    const res = refCountedRxResource({
      params,
      keepAliveMs: 10,
      injector,
      stream: ({params}) =>
        new Observable<number>((subscriber) => {
          subscriptions++;
          subscriber.next(params * 10);
          return () => unsubscriptions++;
        }),
    });
    return {
      res,
      params,
      get subscriptions() {
        return subscriptions;
      },
      get unsubscriptions() {
        return unsubscriptions;
      },
    };
  }

  it('should be idle without a live reader and stream like rxResource once one reads it', async () => {
    const t = setup();
    TestBed.tick();
    expect(t.res.status()).toBe('idle');
    expect(t.subscriptions).toBe(0);

    const reader = effect(() => void t.res.value(), {injector});
    TestBed.tick();
    await appRef.whenStable();

    expect(t.res.status()).toBe('resolved');
    expect(t.res.value()).toBe(10);
    expect(t.subscriptions).toBe(1);

    // The stream never completes, so releasing must unsubscribe it.
    reader.destroy();
    await timeout(15);

    expect(t.res.status()).toBe('idle');
    expect(t.unsubscriptions).toBe(1);
  });

  it('should return a full ResourceRef, so reload() and params still work', async () => {
    const t = setup();
    effect(() => void t.res.value(), {injector});
    TestBed.tick();
    await appRef.whenStable();

    expect(t.res.reload()).toBe(true);
    TestBed.tick();
    await appRef.whenStable();
    expect(t.subscriptions).toBe(2);

    t.params.set(2);
    TestBed.tick();
    await appRef.whenStable();
    expect(t.res.value()).toBe(20);
    expect(t.subscriptions).toBe(3);
  });

  it('should require an injection context, named after itself', () => {
    expect(() => refCountedRxResource({stream: () => of(1)})).toThrowError(
      /refCountedRxResource\(\) can only be used within an injection context/,
    );
  });
});
