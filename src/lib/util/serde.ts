import type { State } from '$lib/types';
import { fromBase64, fromUint8Array, toBase64, toUint8Array } from 'js-base64';
import { deflate, inflate } from 'pako';

interface Serde {
  serialize: (state: string) => string;
  deserialize: (state: string) => string;
}

const base64Serde: Serde = {
  serialize: (state: string): string => {
    return toBase64(state, true);
  },
  deserialize: (state: string): string => {
    return fromBase64(state);
  }
};

export const pakoSerde: Serde = {
  serialize: (state: string): string => {
    const data = new TextEncoder().encode(state);
    // Level 6 (pako's default) compresses 2-2.5x faster than level 9 for a
    // ~1% larger result on diagram-sized states, and identical bytes for
    // small ones. Any deflate level round-trips through the same inflate,
    // so old and new URLs stay mutually readable.
    const compressed = deflate(data, { level: 6 });
    return fromUint8Array(compressed, true);
  },
  deserialize: (state: string): string => {
    const data = toUint8Array(state);
    // Deflate decompression bombs: a hand-crafted ~1KB payload can expand
    // to gigabytes. Cap the accepted inflated size well above any real
    // diagram state; over the cap this throws and the caller shows the
    // URL-troubleshooting diagram instead of freezing the tab.
    const MAX_INFLATED_BYTES = 20 * 1024 * 1024;
    const inflated = inflate(data);
    if (inflated.byteLength > MAX_INFLATED_BYTES) {
      throw new Error('Serialized state too large');
    }
    return new TextDecoder().decode(inflated);
  }
};

export type SerdeType = 'base64' | 'pako';

const serdes: Record<SerdeType, Serde> = {
  base64: base64Serde,
  pako: pakoSerde
};

export const serializeState = (state: State, serde: SerdeType = 'pako'): string => {
  if (!(serde in serdes)) {
    throw new Error(`Unknown serde type: ${serde}`);
  }
  const json = JSON.stringify(state);
  const serialized = serdes[serde].serialize(json);
  return `${serde}:${serialized}`;
};

export const deserializeState = (state: string): State => {
  let type: SerdeType, serialized: string;
  if (state.includes(':')) {
    let tempType: string;
    [tempType, serialized] = state.split(':');
    if (tempType in serdes) {
      type = tempType as SerdeType;
    } else {
      throw new Error(`Unknown serde type: ${tempType}`);
    }
  } else {
    type = 'base64';
    serialized = state;
  }
  const json = serdes[type].deserialize(serialized);
  return JSON.parse(json) as State;
};

// A whole share link (or bare serialized state) pasted into the code editor —
// the error banner offers to load it instead of leaving users to hand-edit a
// URL. Returns the hash payload (`pako:…` / `base64:…`) for loadState, or
// undefined when the code is anything else. The serde type is accepted in any
// case and normalized to lowercase, matching deserializeState's keys.
const SHARE_LINK_RE = /^(?:https?:\/\/[^\s]*#)?(pako|base64):([A-Za-z0-9+/=_-]+)$/i;

export const shareLinkHash = (code: string): string | undefined => {
  const match = code.trim().match(SHARE_LINK_RE);
  return match ? `${match[1].toLowerCase()}:${match[2]}` : undefined;
};
