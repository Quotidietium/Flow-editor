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
      `"pako:eJxVjMFugzAMQH_F8mmT2h_gUGmFrZeq26Gnkh4sMCQqiaMQhCrg3xfaTdp8svXe84SV1IwZNp2MlaYQ4VwoB2neylwH00dL_RW229184AhWHN9n2L8cBHot3hvXvj79_SpBPh1XjSFq427LE-WP_tPxDEV5JB_FX_-S8ygzvJfmS6f3_4kOnKqP8sQjVBQeEDfYBlNjFsPAG7QcLK0nTitVGDVbVpilteaGhi4qVG5JmSd3EbG_ZZCh1Zg11PXpGnxNkQtDbaAfZfkGqoRdQg"`
    );
  });

  it('should serialize and deserialize with base64 serde', () => {
    expect(verifySerde(defaultState, 'base64')).toMatchInlineSnapshot(
      `"base64:eyJjb2RlIjoiZmxvd2NoYXJ0IFREXG4gICAgQVtDaHJpc3RtYXNdIC0tPnxHZXQgbW9uZXl8IEIoR28gc2hvcHBpbmcpXG4gICAgQiAtLT4gQ3tMZXQgbWUgdGhpbmt9XG4gICAgQyAtLT58T25lfCBEW0xhcHRvcF1cbiAgICBDIC0tPnxUd298IEVbaVBob25lXVxuICAgIEMgLS0-fFRocmVlfCBGW05ldyBjYXJdXG4gICIsImdyaWQiOnRydWUsIm1lcm1haWQiOiJ7XG4gIFwidGhlbWVcIjogXCJkZWZhdWx0XCJcbn0iLCJwYW5ab29tIjp0cnVlLCJyb3VnaCI6ZmFsc2UsInVwZGF0ZURpYWdyYW0iOnRydWV9"`
    );
  });

  it('should serialize and deserialize with pako serde', () => {
    expect(verifySerde(defaultState, 'pako')).toMatchInlineSnapshot(
      `"pako:eJxVjMFugzAMQH_F8mmT2h_gUGmFrZeq26Gnkh4sMCQqiaMQhCrg3xfaTdp8svXe84SV1IwZNp2MlaYQ4VwoB2neylwH00dL_RW229184AhWHN9n2L8cBHot3hvXvj79_SpBPh1XjSFq427LE-WP_tPxDEV5JB_FX_-S8ygzvJfmS6f3_4kOnKqP8sQjVBQeEDfYBlNjFsPAG7QcLK0nTitVGDVbVpilteaGhi4qVG5JmSd3EbG_ZZCh1Zg11PXpGnxNkQtDbaAfZfkGqoRdQg"`
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
