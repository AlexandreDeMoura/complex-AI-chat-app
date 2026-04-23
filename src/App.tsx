import { Navigate, Route, Routes } from 'react-router-dom'
import { Thread } from '@/components/thread'
import { LoginPage, ProtectedRoute, PublicOnlyRoute } from '@/features/auth/view'
import { CollectionsListPage } from '@/features/quiz/view/collections-list-page'
import { QuizPage } from '@/features/quiz/view/quiz-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Thread />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/collections" element={<CollectionsListPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
