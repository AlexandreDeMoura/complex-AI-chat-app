import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseQuizGradingResponse,
  parseQuizGradingResponseWithSingleRetry,
  QuizGradingParseError,
} from './grading-parser.js'

test('parseQuizGradingResponse parses valid grading JSON', () => {
  const parsed = parseQuizGradingResponse('{"feedback":"Clear reasoning.","grade":4}')

  assert.deepEqual(parsed, {
    feedback: 'Clear reasoning.',
    grade: 4,
  })
})

test('parseQuizGradingResponse parses fenced JSON grading output', () => {
  const parsed = parseQuizGradingResponse(
    '```json\n{"feedback":"Good answer overall.","grade":3}\n```',
  )

  assert.deepEqual(parsed, {
    feedback: 'Good answer overall.',
    grade: 3,
  })
})

test('parseQuizGradingResponseWithSingleRetry uses retry response when initial parse fails', () => {
  const parsed = parseQuizGradingResponseWithSingleRetry({
    initialResponse: 'I think this is about closures.',
    retryResponse: '{"feedback":"Core idea is correct, but missing edge cases.","grade":3}',
  })

  assert.deepEqual(parsed, {
    feedback: 'Core idea is correct, but missing edge cases.',
    grade: 3,
  })
})

test('parseQuizGradingResponseWithSingleRetry falls back to raw feedback with grade null after failed retry', () => {
  const parsed = parseQuizGradingResponseWithSingleRetry({
    initialResponse: 'Initial unparseable response',
    retryResponse: 'Retry unparseable response',
  })

  assert.deepEqual(parsed, {
    feedback: 'Retry unparseable response',
    grade: null,
  })
})

test('parseQuizGradingResponse throws for empty response', () => {
  assert.throws(
    () => parseQuizGradingResponse('   '),
    (error) => error instanceof QuizGradingParseError,
  )
})

