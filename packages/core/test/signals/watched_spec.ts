/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {computed, signal} from '../../src/core';
import {createWatch, ReactiveNode, SIGNAL} from '../../primitives/signals';

describe('signal graph: watched / unwatched hooks', () => {
  function track(node: ReactiveNode): string[] {
    const events: string[] = [];
    node.watched = () => events.push('watched');
    node.unwatched = () => events.push('unwatched');
    return events;
  }

  function liveWatch(fn: () => void) {
    const watch = createWatch(fn, () => {}, true);
    watch.run();
    return watch;
  }

  it('should not fire for non-live reads', () => {
    const source = signal(0);
    const events = track(source[SIGNAL] as ReactiveNode);

    source();
    const derived = computed(() => source() + 1);
    derived();

    expect(events).toEqual([]);
  });

  it('should fire `watched` once when the first live consumer appears, and `unwatched` when the last one leaves', () => {
    const source = signal(0);
    const events = track(source[SIGNAL] as ReactiveNode);

    const first = liveWatch(() => source());
    expect(events).toEqual(['watched']);

    const second = liveWatch(() => source());
    expect(events).toEqual(['watched']);

    first.destroy();
    expect(events).toEqual(['watched']);

    second.destroy();
    expect(events).toEqual(['watched', 'unwatched']);
  });

  it('should fire transitively through a computed', () => {
    const source = signal(0);
    const events = track(source[SIGNAL] as ReactiveNode);
    const derived = computed(() => source() + 1);

    const watch = liveWatch(() => derived());
    expect(events).toEqual(['watched']);

    watch.destroy();
    expect(events).toEqual(['watched', 'unwatched']);
  });

  it('should fire `unwatched` when a live consumer stops reading the node', () => {
    const source = signal(0);
    const toggle = signal(true);
    const events = track(source[SIGNAL] as ReactiveNode);

    const watch = createWatch(
      () => {
        if (toggle()) {
          source();
        }
      },
      () => {},
      true,
    );
    watch.run();
    expect(events).toEqual(['watched']);

    toggle.set(false);
    watch.run();
    expect(events).toEqual(['watched', 'unwatched']);

    toggle.set(true);
    watch.run();
    expect(events).toEqual(['watched', 'unwatched', 'watched']);

    watch.destroy();
  });
});
