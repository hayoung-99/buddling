import { createRoot } from 'react-dom/client'
import { TeamList } from './TeamList'
import '../theme.css'

createRoot(document.getElementById('root') as HTMLElement).render(<TeamList />)
