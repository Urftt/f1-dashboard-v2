import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import RacePage from './pages/RacePage'
import QualiPage from './pages/QualiPage'
import PracticePage from './pages/PracticePage'
import WeekendPicker from './components/WeekendPicker'
import { WeekendProvider } from './data/WeekendContext'
import { ClockProvider } from './replay/ClockContext'

// Tabs must carry the CURRENT query string (weekend + driver selection).
// useLocation subscribes this component to navigation, so the links never
// go stale after a weekend switch.
function Tabs() {
  const { search } = useLocation()
  return (
    <nav className="tabs">
      <NavLink to={{ pathname: '/', search }} end>
        Race
      </NavLink>
      <NavLink to={{ pathname: '/quali', search }}>Qualifying</NavLink>
      <NavLink to={{ pathname: '/practice', search }}>Practice</NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <WeekendProvider>
      <ClockProvider>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              Pit<em>wall</em>
            </div>
            <Tabs />
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
      </ClockProvider>
    </WeekendProvider>
  )
}
