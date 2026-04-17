import { Navigate, Route, Routes } from 'react-router-dom'
import { Thread } from '@/components/thread'
import { QuizPage } from '@/features/quiz/view/quiz-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Thread />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
