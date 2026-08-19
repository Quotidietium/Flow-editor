import { describe, expect, it } from 'vitest';
import { serializeState, deserializeState, type SerdeType } from './serde';
import { defaultState } from './state.svelte';
import type { State } from '$lib/types';

const verifySerde = (state: State, serde?: SerdeType): string => {
  const serialized = serializeState(state, serde);
  const deserialized = deserializeState(serialized);
  expect(deserialized).to.deep.equal(state);
  return serialized;
};

describe('Serde tests', () => {
  it('should serialize and deserialize with default serde', () => {
    expect(verifySerde(defaultState)).toMatchInlineSnapshot(
      `"pako:eJyrVkrOT0lVslJKy8kvT85ILCpRCHGJyVMAAsfop3MWv1g_70VXU6yCrq5dzbPu_U87Njzt6366qfHlpI01Ck4aT_t2v9iy9nnnSk2IHieQQgXn6hfrVj7rmPiseTMQ1UKknMFmPNnRUKPgEv18zZQX6zY8m7Pm-ZStL1omxqIo2dVTo-AanRmQkZ-Xiiqzo7NGwS362bQNL_YuA8so6SilF2WmKFmVFJWm6ijlphblJoK4StUg2RilkozU3NQYJSsgMyU1LbE0pyRGKSavFqitIDEvKj8_F6azKL80PUPJKi0xpxjIKy1ISSxJdclMTC9KhCqpBQCBtXnh"`
    );
  });

  it('should serialize and deserialize with base64 serde', () => {
    expect(verifySerde(defaultState, 'base64')).toMatchInlineSnapshot(
      `"base64:eyJjb2RlIjoiZmxvd2NoYXJ0IFREXG4gICAgQVvlnKPor57oioJdIC0tPnzmi7_liLDljovlsoHpkrF8IEIo5Y676LSt54mpKVxuICAgIEIgLS0-IEN76K6p5oiR5oOz5oOzfVxuICAgIEMgLS0-fOS4gHwgRFvnrJTorrDmnKznlLXohJFdXG4gICAgQyAtLT585LqMfCBFW2lQaG9uZV1cbiAgICBDIC0tPnzkuIl8IEZb5paw6L2mXVxuICAiLCJncmlkIjp0cnVlLCJtZXJtYWlkIjoie1xuICBcInRoZW1lXCI6IFwiZGVmYXVsdFwiXG59IiwicGFuWm9vbSI6dHJ1ZSwicm91Z2giOmZhbHNlLCJ1cGRhdGVEaWFncmFtIjp0cnVlfQ"`
    );
  });

  it('should serialize and deserialize with pako serde', () => {
    expect(verifySerde(defaultState, 'pako')).toMatchInlineSnapshot(
      `"pako:eJyrVkrOT0lVslJKy8kvT85ILCpRCHGJyVMAAsfop3MWv1g_70VXU6yCrq5dzbPu_U87Njzt6366qfHlpI01Ck4aT_t2v9iy9nnnSk2IHieQQgXn6hfrVj7rmPiseTMQ1UKknMFmPNnRUKPgEv18zZQX6zY8m7Pm-ZStL1omxqIo2dVTo-AanRmQkZ-Xiiqzo7NGwS362bQNL_YuA8so6SilF2WmKFmVFJWm6ijlphblJoK4StUg2RilkozU3NQYJSsgMyU1LbE0pyRGKSavFqitIDEvKj8_F6azKL80PUPJKi0xpxjIKy1ISSxJdclMTC9KhCqpBQCBtXnh"`
    );
  });

  it('should throw error for unrecognized serde', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    expect(() => serializeState(defaultState, 'unknown')).toThrowError(
      'Unknown serde type: unknown'
    );
    expect(() => deserializeState('unknown:hello')).toThrowError('Unknown serde type: unknown');
  });
});
