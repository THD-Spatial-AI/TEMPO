import { HashRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Home from './pages/Home'
import Features from './pages/Features'
import Docs from './pages/Docs'
import ApiRef from './pages/ApiRef'
import License from './pages/License'
import Privacy from './pages/Privacy'
import CodeOfConduct from './pages/CodeOfConduct'

export default function App() {
  return (
    <HashRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/api" element={<ApiRef />} />
        <Route path="/license" element={<License />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/code-of-conduct" element={<CodeOfConduct />} />
      </Routes>
    </HashRouter>
  )
}
