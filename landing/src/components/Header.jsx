import { Link, useLocation } from 'react-router-dom'

export default function Header() {
  const { pathname } = useLocation()

  const navLinks = [
    { label: 'Features', to: '/features', internal: true },
    { label: 'Download', href: '#download' },
    { label: 'Documentation', href: '#docs' },
    { label: 'Changelog', href: '#changelog' },
  ]

  return (
    <header className="bg-[#FAF8FF] fixed top-0 w-full z-50 border-b border-black/15">
      <div className="flex justify-between items-center w-full px-8 h-16 max-w-none">
        <Link
          to="/"
          className="text-2xl font-bold tracking-[-0.02em] text-black uppercase font-inter"
        >
          TEMPO
        </Link>

        <nav className="hidden md:flex space-x-8 h-full items-center">
          {navLinks.map((link) => {
            const isActive = link.internal ? pathname === link.to : false
            const base = 'font-inter font-semibold text-[0.875rem] tracking-tight uppercase'
            const active = 'border-b-2 border-black text-black pb-1'
            const inactive = 'text-black/60 hover:text-black transition-colors duration-200'

            if (link.internal) {
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  className={`${base} ${isActive ? active : inactive}`}
                >
                  {link.label}
                </Link>
              )
            }
            return (
              <a
                key={link.label}
                href={link.href}
                className={`${base} ${inactive}`}
              >
                {link.label}
              </a>
            )
          })}
        </nav>

        <button className="bg-black text-[#E2E2E2] px-6 py-2 font-bold uppercase text-[0.75rem] tracking-widest hover:bg-[#3B3B3B] transition-all active:translate-y-0.5">
          Get Started
        </button>
      </div>
    </header>
  )
}
