import { describe, expect, it } from 'vitest';
import {
  MCP_PORT_DEFAULT,
  MCP_PORT_MAX,
  MCP_PORT_MIN,
  normalizeMcpConfig,
  validateMcpPort
} from './mcpConfig';

describe('MCP config validation', () => {
  it('accepts integer ports inside the user range', () => {
    expect(validateMcpPort(MCP_PORT_MIN)).toBe(MCP_PORT_MIN);
    expect(validateMcpPort(MCP_PORT_MAX)).toBe(MCP_PORT_MAX);
    expect(validateMcpPort(MCP_PORT_DEFAULT)).toBe(MCP_PORT_DEFAULT);
    expect(validateMcpPort('38528')).toBe(38_528); // input fields produce strings
  });

  it('rejects out-of-range, non-integer and non-numeric ports', () => {
    expect(validateMcpPort(MCP_PORT_MIN - 1)).toBeUndefined();
    expect(validateMcpPort(MCP_PORT_MAX + 1)).toBeUndefined();
    expect(validateMcpPort(38_528.5)).toBeUndefined();
    expect(validateMcpPort('abc')).toBeUndefined();
    expect(validateMcpPort('')).toBeUndefined();
    expect(validateMcpPort(undefined)).toBeUndefined();
    expect(validateMcpPort(null)).toBeUndefined();
    expect(validateMcpPort(Number.NaN)).toBeUndefined();
  });

  it('normalizeMcpConfig hardens untrusted input', () => {
    expect(normalizeMcpConfig(undefined)).toEqual({ enabled: false, port: MCP_PORT_DEFAULT });
    expect(normalizeMcpConfig(null)).toEqual({ enabled: false, port: MCP_PORT_DEFAULT });
    expect(normalizeMcpConfig('junk')).toEqual({ enabled: false, port: MCP_PORT_DEFAULT });
    expect(normalizeMcpConfig({ enabled: 'yes', port: '80' })).toEqual({
      enabled: false,
      port: MCP_PORT_DEFAULT
    });
    expect(normalizeMcpConfig({ enabled: true, port: 40_000 })).toEqual({
      enabled: true,
      port: 40_000
    });
    // Unknown keys are dropped, never carried through.
    expect(normalizeMcpConfig({ enabled: true, evil: '__proto__', port: 40_000 })).toEqual({
      enabled: true,
      port: 40_000
    });
  });
});
