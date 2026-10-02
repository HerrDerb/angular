/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {assertInInjectionContext, inject, Injector, ResourceRef} from '../../src/core';
import {rxResource, RxResourceOptions} from './rx_resource';

/**
 * Options for `refCountedRxResource`: those of `rxResource`, with the lifetime fixed to
 * `'refCounted'`.
 *
 * @experimental
 */
export type RefCountedRxResourceOptions<T, R> = Omit<RxResourceOptions<T, R>, 'lifetime'>;

/**
 * Like `rxResource`, but with `lifetime: 'refCounted'`: the resource is `idle` until something
 * live, such as a template or an `effect`, reads it. The first live reader starts the stream,
 * further ones share it, and `keepAliveMs` after the last one is gone the stream is unsubscribed
 * and the resource returns to `idle`.
 *
 * Hold it in a long-lived service and read it from the views that need the data: it then fetches
 * only while at least one of them is on screen.
 *
 * @experimental
 */
export function refCountedRxResource<T, R>(
  opts: RefCountedRxResourceOptions<T, R> & {defaultValue: NoInfer<T>},
): ResourceRef<T>;

/**
 * Like `rxResource`, but with `lifetime: 'refCounted'`: the resource is `idle` until something
 * live, such as a template or an `effect`, reads it. The first live reader starts the stream,
 * further ones share it, and `keepAliveMs` after the last one is gone the stream is unsubscribed
 * and the resource returns to `idle`.
 *
 * @experimental
 */
export function refCountedRxResource<T, R>(
  opts: RefCountedRxResourceOptions<T, R>,
): ResourceRef<T | undefined>;
export function refCountedRxResource<T, R>(
  opts: RefCountedRxResourceOptions<T, R>,
): ResourceRef<T | undefined> {
  if (ngDevMode && !opts?.injector) {
    assertInInjectionContext(refCountedRxResource);
  }
  return rxResource<T, R>({
    ...opts,
    lifetime: 'refCounted',
    injector: opts.injector ?? inject(Injector),
  });
}
