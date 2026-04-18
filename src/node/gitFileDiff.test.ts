import { describe, expect, it } from 'vitest'

import { parseGitFileDiff } from './gitFileDiff'

describe('parseGitFileDiff', () => {
  it('maps pure additions to added line ranges in the new file', () => {
    const diff = parseGitFileDiff(
      'src/example.ts',
      [
        'diff --git a/src/example.ts b/src/example.ts',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
        '@@ -4,0 +4,2 @@',
        '+const a = 1',
        '+const b = 2',
      ].join('\n'),
    )

    expect(diff).toEqual(
      expect.objectContaining({
        addedLineCount: 2,
        modifiedLineCount: 0,
        deletedLineCount: 0,
        fingerprint: expect.any(String),
        changes: [
          {
            endLine: 5,
            kind: 'added',
            startLine: 4,
          },
        ],
      }),
    )
  })

  it('maps replacements to modified ranges instead of whole hunk guesses', () => {
    const diff = parseGitFileDiff(
      'src/example.ts',
      [
        'diff --git a/src/example.ts b/src/example.ts',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
        '@@ -10,2 +10,3 @@',
        '-oldOne()',
        '-oldTwo()',
        '+newOne()',
        '+newTwo()',
        '+newThree()',
      ].join('\n'),
    )

    expect(diff).toEqual(
      expect.objectContaining({
        addedLineCount: 0,
        modifiedLineCount: 3,
        deletedLineCount: 0,
        fingerprint: expect.any(String),
        changes: [
          {
            endLine: 12,
            kind: 'modified',
            startLine: 10,
          },
        ],
      }),
    )
  })

  it('tracks pure deletions without painting non-existent new lines', () => {
    const diff = parseGitFileDiff(
      'src/example.ts',
      [
        'diff --git a/src/example.ts b/src/example.ts',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
        '@@ -20,3 +20,0 @@',
        '-removeOne()',
        '-removeTwo()',
        '-removeThree()',
      ].join('\n'),
    )

    expect(diff).toEqual(
      expect.objectContaining({
        addedLineCount: 0,
        modifiedLineCount: 0,
        deletedLineCount: 3,
        fingerprint: expect.any(String),
        changes: [],
      }),
    )
  })
})
