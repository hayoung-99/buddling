import { createRoot } from 'react-dom/client'
import { Settings } from './Settings'
// 크림색 톤과 목록 한 줄의 생김새를 팀 창에서 그대로 빌려 쓴다
import '../team/team.css'
import './settings.css'

createRoot(document.getElementById('root') as HTMLElement).render(<Settings />)
