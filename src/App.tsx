import { NavLink, Route, Routes } from 'react-router-dom'
import RacePage from './pages/RacePage'
import QualiPage from './pages/QualiPage'
import PracticePage from './pages/PracticePage'
import WeekendPicker from './components/WeekendPicker'
import { WeekendProvider } from './data/WeekendContext'

export default function App() {
  return (
    <WeekendProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            Pit<em>wall</em>
          </div>
          <nav className="tabs">
            <NavLink to={{ pathname: '/', search: window.location.search }} end>
              Race
            </NavLink>
            <NavLink to={{ pathname: '/quali', search: window.location.search }}>
              Qualifying
            </NavLink>
            <NavLink to={{ pathname: '/practice', search: window.location.search }}>
              Practice
            </NavLink>
          </nav>
          <div className="spacer" />
          <WeekendPicker />
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<RacePage />} />
            <Route path="/quali" element={<QualiPage />} />
            <Route path="/practice" element={<PracticePage />} />
          </Routes>
        </main>
      </div>
    </WeekendProvider>
  )
}
