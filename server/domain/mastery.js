const MIN_MASTERY_LEVEL = 0
const MAX_MASTERY_LEVEL = 5

const normalizeCachedMasteryLevel = (value) => {
  if (!Number.isInteger(value)) {
    return MIN_MASTERY_LEVEL
  }

  if (value < MIN_MASTERY_LEVEL) {
    return MIN_MASTERY_LEVEL
  }

  if (value > MAX_MASTERY_LEVEL) {
    return MAX_MASTERY_LEVEL
  }

  return value
}

const toOpenGrade = (record) => {
  if (!record || record.mode !== 'open') {
    return null
  }

  const { grade } = record
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) {
    return null
  }

  return grade
}

const isCorrectMcqAnswer = (record) => record?.mode === 'mcq' && record.is_correct === true

const deriveOpenMasteryLevel = (openGrades) => {
  if (openGrades.length === 0) {
    return 0
  }

  const hasPerfectAnswer = openGrades.some((grade) => grade === 5)
  const gradesAtLeastFourCount = openGrades.filter((grade) => grade >= 4).length

  if (hasPerfectAnswer || gradesAtLeastFourCount >= 2) {
    return 5
  }

  if (gradesAtLeastFourCount >= 1) {
    return 4
  }

  if (openGrades.some((grade) => grade >= 3)) {
    return 3
  }

  if (openGrades.some((grade) => grade >= 2)) {
    return 2
  }

  return 0
}

export const computeMastery = (answerHistory, currentCachedLevel = 0) => {
  const records = Array.isArray(answerHistory) ? answerHistory : []

  let mcqCorrectCount = 0
  const openGrades = []

  for (const record of records) {
    if (isCorrectMcqAnswer(record)) {
      mcqCorrectCount += 1
    }

    const openGrade = toOpenGrade(record)
    if (openGrade !== null) {
      openGrades.push(openGrade)
    }
  }

  const mcqMasteryLevel = mcqCorrectCount >= 2 ? 1 : 0
  const openMasteryLevel = deriveOpenMasteryLevel(openGrades)
  const computedLevel = Math.max(mcqMasteryLevel, openMasteryLevel)
  const cachedLevel = normalizeCachedMasteryLevel(currentCachedLevel)

  return Math.max(cachedLevel, computedLevel)
}

