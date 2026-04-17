import type { ZodIssue } from 'zod'
import { quizSchema, type QuizQuestion, type QuizUploadError } from '@/features/quiz/model'

export const QUIZ_UPLOAD_MAX_SIZE_BYTES = 1_048_576

interface ParseQuizUploadSuccess {
  success: true
  questions: QuizQuestion[]
}

interface ParseQuizUploadFailure {
  success: false
  error: QuizUploadError
}

export type ParseQuizUploadResult = ParseQuizUploadSuccess | ParseQuizUploadFailure

export async function parseQuizUploadFile(file: File): Promise<ParseQuizUploadResult> {
  if (!isJsonFile(file)) {
    return {
      success: false,
      error: {
        title: 'Unsupported file type',
        details: ['Select a .json file to load a quiz.'],
      },
    }
  }

  if (file.size === 0) {
    return {
      success: false,
      error: {
        title: 'Empty file',
        details: ['The selected file is empty. Add quiz questions and try again.'],
      },
    }
  }

  if (file.size > QUIZ_UPLOAD_MAX_SIZE_BYTES) {
    return {
      success: false,
      error: {
        title: 'File too large',
        details: [
          `File size is ${formatFileSize(file.size)}. The maximum allowed size is 1 MB.`,
        ],
      },
    }
  }

  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(await file.text())
  } catch {
    return {
      success: false,
      error: {
        title: 'Invalid JSON syntax',
        details: [
          'The file content is not valid JSON. Check commas, quotes, and brackets.',
        ],
      },
    }
  }

  const validationResult = quizSchema.safeParse(parsedJson)

  if (!validationResult.success) {
    return {
      success: false,
      error: {
        title: 'Quiz schema validation failed',
        details: formatSchemaIssues(validationResult.error.issues),
      },
    }
  }

  return {
    success: true,
    questions: validationResult.data,
  }
}

function isJsonFile(file: File): boolean {
  const fileName = file.name.toLowerCase()
  return fileName.endsWith('.json') || file.type === 'application/json' || file.type === 'text/json'
}

function formatFileSize(sizeInBytes: number): string {
  const sizeInKilobytes = sizeInBytes / 1024
  return `${sizeInKilobytes.toFixed(1)} KB`
}

function formatSchemaIssues(issues: ZodIssue[]): string[] {
  const maxIssuesToDisplay = 5
  const visibleIssues = issues.slice(0, maxIssuesToDisplay)
  const formattedIssues = visibleIssues.map((issue) => {
    const path = formatIssuePath(issue.path)
    const message = formatIssueMessage(issue)
    return `${path}: ${message}`
  })

  const omittedIssues = issues.length - visibleIssues.length
  if (omittedIssues > 0) {
    formattedIssues.push(`${omittedIssues} additional schema issue(s) omitted.`)
  }

  return formattedIssues
}

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return 'quiz'
  }

  let output = ''

  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]

    if (typeof segment === 'number') {
      if (index === 0) {
        output += `questions[${segment + 1}]`
      } else {
        output += `[${segment + 1}]`
      }
      continue
    }

    const key = String(segment)
    output += output ? `.${key}` : key
  }

  return output
}

function formatIssueMessage(issue: ZodIssue): string {
  if (issue.code === 'invalid_type') {
    if (issue.message.includes('received undefined')) {
      const expectedType = extractExpectedType(issue.message)
      return `Missing required ${expectedType} value.`
    }

    return issue.message.replace('Invalid input: ', '')
  }

  if (issue.code === 'unrecognized_keys') {
    return `Unexpected key(s): ${issue.keys.join(', ')}.`
  }

  return issue.message
}

function extractExpectedType(issueMessage: string): string {
  const match = issueMessage.match(/expected\s+([^,]+),/i)
  return match?.[1] ?? 'value'
}
