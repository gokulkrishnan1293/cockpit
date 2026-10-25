import { expect, test } from 'claude-code/testing'

import { classify } from '../hooks/features/blast-logic.mjs'

test('risky commands are caught, safe ones pass', () => {
  expect(classify('rm -rf build')?.label).toBe('rm -rf')
  expect(classify('cd app && git reset --hard HEAD~1')?.label).toBe('git reset --hard')
  expect(classify('git push --force origin main')?.label).toBe('git push --force')
  expect(classify('ls -la && git status')).toBeNull()
  expect(classify('rm notes.txt')).toBeNull()
})
