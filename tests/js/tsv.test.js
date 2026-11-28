import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTsv, parseTsv } from '../../resources/js/tsv.js';

test('parses a plain block, with or without a trailing newline', () => {
    assert.deepEqual(parseTsv('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseTsv('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]);
});

test('keeps empty cells and a single empty value', () => {
    assert.deepEqual(parseTsv('\tb\t'), [['', 'b', '']]);
    assert.deepEqual(parseTsv(''), [['']]);
    assert.deepEqual(parseTsv('\n'), [['']]);
});

test('parses quoted cells with newlines, tabs and escaped quotes', () => {
    assert.deepEqual(parseTsv('"line1\nline2"\tx\n"say ""hi"""\t"a\tb"'), [['line1\nline2', 'x'], ['say "hi"', 'a\tb']]);
});

test('takes a malformed leading quote literally', () => {
    assert.deepEqual(parseTsv('"abc\tx'), [['"abc', 'x']]);
    assert.deepEqual(parseTsv('"a"b\tx'), [['"a"b', 'x']]);
    assert.deepEqual(parseTsv('5" screen'), [['5" screen']]);
});

test('format and parse round-trip', () => {
    const rows = [['plain', 'multi\nline', 'tab\there'], ['quote "q"', '', 'end']];
    assert.equal(formatTsv([['a', 'b'], ['c', '']]), 'a\tb\nc\t');
    assert.deepEqual(parseTsv(formatTsv(rows)), rows);
});
