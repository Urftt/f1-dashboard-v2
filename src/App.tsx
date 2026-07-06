import { NavLink, Route, Routes } from 'react-router-dom'
import RacePage from './pages/RacePage'
import QualiPage from './pages/QualiPage'
import PracticePage from './pages/PracticePage'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Pit<em>wall</em>
        </div>
        <nav className="tabs">
          <NavLink to="/" end>
            Race
          </NavLink>
          <NavLink to="/quali">Qualifying</NavLink>
          <NavLink to="/practice">Practice</NavLink>
        </nav>
        <div className="spacer" />
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<RacePage />} />
          <Route path="/quali" element={<QualiPage />} />
          <Route path="/practice" element={<PracticePage />} />
        </Routes>
      </main>
    </div>
  )
}
