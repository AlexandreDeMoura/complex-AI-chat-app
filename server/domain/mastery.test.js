import assert from 'node:assert/strict'
import test from 'node:test'
import { computeMastery } from './mastery.js'

test('computeMastery returns level 0 when there are no attempts', () => {
  assert.equal(computeMastery([]), 0)
  assert.equal(computeMastery(null), 0)
})

test('computeMastery returns level 1 after at least two correct MCQ attempts', () => {
  const answerHistory = [
    { mode: 'mcq', is_correct: true },
    { mode: 'mcq', is_correct: false },
    { mode: 'mcq', is_correct: true },
  ]

  assert.equal(computeMastery(answerHistory), 1)
})

test('computeMastery returns level 2 when an open attempt has grade >= 2', () => {
  const answerHistory = [
    { mode: 'open', grade: 1 },
    { mode: 'open', grade: 2 },
  ]

  assert.equal(computeMastery(answerHistory), 2)
})

test('computeMastery returns level 3 when an open attempt has grade >= 3', () => {
  const answerHistory = [
    { mode: 'open', grade: 2 },
    { mode: 'open', grade: 3 },
  ]

  assert.equal(computeMastery(answerHistory), 3)
})

test('computeMastery returns level 4 when an open attempt has grade >= 4', () => {
  const answerHistory = [
    { mode: 'open', grade: 3 },
    { mode: 'open', grade: 4 },
  ]

  assert.equal(computeMastery(answerHistory), 4)
})

test('computeMastery returns level 5 when an open attempt has grade 5', () => {
  const answerHistory = [
    { mode: 'open', grade: 2 },
    { mode: 'open', grade: 5 },
  ]

  assert.equal(computeMastery(answerHistory), 5)
})

test('computeMastery returns level 5 when two open attempts have grade >= 4', () => {
  const answerHistory = [
    { mode: 'open', grade: 4 },
    { mode: 'open', grade: 4 },
  ]

  assert.equal(computeMastery(answerHistory), 5)
})

test('computeMastery is monotonic when cached mastery is already higher', () => {
  const answerHistory = [
    { mode: 'open', grade: 1 },
    { mode: 'mcq', is_correct: false },
  ]

  assert.equal(computeMastery(answerHistory, 4), 4)
})

