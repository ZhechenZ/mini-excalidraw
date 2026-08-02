// Week 6：utils/roomId 单测 —— 房间路由解析与邀请链接构造。
// @vitest-environment jsdom
//
// 需要 window.location / crypto，故整文件切到 jsdom 环境。
// 覆盖：随机 ID 的字符集与长度、hash 解析（含只读 mode=view）、写回 hash、邀请链接构造。

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRoomId,
  readRoomFromHash,
  writeRoomToHash,
  buildInviteUrl,
} from '@/utils/roomId';

beforeEach(() => {
  window.location.hash = '';
});

describe('generateRoomId', () => {
  it('produces a 10-char id from the safe alphabet', () => {
    const id = generateRoomId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[23456789abcdefghijkmnpqrstuvwxyz]+$/);
  });

  it('is (practically) unique across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateRoomId()));
    expect(set.size).toBe(50);
  });
});

describe('readRoomFromHash', () => {
  it('returns null room when hash is empty', () => {
    expect(readRoomFromHash()).toEqual({ roomId: null, readOnly: false });
  });

  it('parses room id', () => {
    window.location.hash = '#room=abc123';
    expect(readRoomFromHash()).toEqual({ roomId: 'abc123', readOnly: false });
  });

  it('parses read-only mode', () => {
    window.location.hash = '#room=abc123&mode=view';
    expect(readRoomFromHash()).toEqual({ roomId: 'abc123', readOnly: true });
  });
});

describe('writeRoomToHash', () => {
  it('writes room id into the hash', () => {
    writeRoomToHash('xyz789');
    expect(readRoomFromHash().roomId).toBe('xyz789');
  });

  it('writes view mode when read-only', () => {
    writeRoomToHash('xyz789', true);
    expect(readRoomFromHash()).toEqual({ roomId: 'xyz789', readOnly: true });
  });
});

describe('buildInviteUrl', () => {
  it('builds an editable invite url', () => {
    expect(buildInviteUrl('room1')).toMatch(/#room=room1$/);
  });

  it('builds a read-only invite url', () => {
    expect(buildInviteUrl('room1', true)).toMatch(/#room=room1&mode=view$/);
  });
});