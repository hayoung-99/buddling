import { createRoot } from 'react-dom/client'
import { TeamList } from './TeamList'
import './team.css'

createRoot(document.getElementById('root') as HTMLElement).render(<TeamList />)
