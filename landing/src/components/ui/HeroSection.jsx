import React from 'react';
import { motion } from 'framer-motion';

const InfoIcon = ({ type }) => {
  const icons = {
    github: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-primary flex-shrink-0">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.52 11.52 0 0 1 3-.405c1.02.005 2.045.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/>
      </svg>
    ),
    email: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary flex-shrink-0">
        <rect width="20" height="16" x="2" y="4" rx="2"></rect>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
      </svg>
    ),
    website: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary flex-shrink-0">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" x2="22" y1="12" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    ),
    phone: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary flex-shrink-0">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    ),
    address: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary flex-shrink-0">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    ),
  };
  return <>{icons[type] ?? null}</>;
};

const HeroSection = React.forwardRef(
  ({ className, logo, slogan, title, subtitle, downloads = [], contacts = [], institution, partners = [], backgroundImage, ...props }, ref) => {

    const containerVariants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.15,
          delayChildren: 0.2,
        },
      },
    };

    const itemVariants = {
      hidden: { y: 20, opacity: 0 },
      visible: {
        y: 0,
        opacity: 1,
        transition: {
          duration: 0.5,
          ease: 'easeOut',
        },
      },
    };

    return (
      <motion.section
        ref={ref}
        className={[
          'relative flex w-full flex-col overflow-hidden bg-background text-foreground md:flex-row',
          className,
        ].filter(Boolean).join(' ')}
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        {...props}
      >
        {/* Left Side: Content */}
        <div className="flex w-full flex-col justify-between p-8 md:w-1/2 md:p-12 lg:w-3/5 lg:p-16">
          {/* Top Section: Logo & Main Content */}
          <div>
            <motion.header className="mb-12" variants={itemVariants}>
              {logo && (
                <div className="flex items-center">
                  {logo.url && <img src={logo.url} alt={logo.alt} className="mr-3 h-8 logo-on-light" />}
                  <div>
                    {logo.text && <p className="text-lg font-bold text-foreground">{logo.text}</p>}
                    {slogan && <p className="text-xs tracking-wider text-muted-foreground">{slogan}</p>}
                  </div>
                </div>
              )}
            </motion.header>

            <motion.main variants={containerVariants}>
              <motion.h1
                className="text-4xl font-bold leading-tight text-foreground md:text-5xl"
                variants={itemVariants}
              >
                {title}
              </motion.h1>
              <motion.div className="my-6 h-1 w-20 bg-primary" variants={itemVariants}></motion.div>
              <motion.p
                className="mb-8 max-w-md text-base text-muted-foreground"
                variants={itemVariants}
              >
                {subtitle}
              </motion.p>
              {downloads.length > 0 && (
                <motion.div className="flex flex-wrap gap-3" variants={itemVariants}>
                  {downloads.map((dl) => (
                    <a
                      key={dl.label}
                      href={dl.href}
                      
                      className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-3 text-sm font-bold tracking-wide hover:opacity-80 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-2xl mb-1">desktop_windows</span>
                      {dl.label}
                      {dl.sub && <span className="text-[10px] font-normal opacity-70 ml-1">{dl.sub}</span>}
                    </a>
                  ))}
                </motion.div>
              )}
            </motion.main>
          </div>

          {/* Institution + Partners strip */}
          {(institution || partners.length > 0) && (
            <motion.div className="mt-10 pt-8 border-t border-foreground/10" variants={itemVariants}>
              {institution && (
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-muted-foreground whitespace-nowrap">Developed at</span>
                  {institution.logo
                    ? (
                      <div className="relative flex-shrink-0" style={{ width: '10rem', height: '2rem' }}>
                        <img
                          src={institution.logo}
                          alt={institution.name}
                          className="absolute left-0 w-auto object-contain"
                          style={{ height: '10rem', top: '50%', transform: 'translateY(-50%)' }}
                        />
                      </div>
                    )
                    : <span className="font-black text-sm text-foreground">{institution.name}</span>
                  }
                  {institution.group && (
                    <span className="text-[11px] text-muted-foreground border-l border-foreground/20 pl-3">{institution.group}</span>
                  )}
                </div>
              )}
              {partners.length > 0 && (
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-muted-foreground whitespace-nowrap">Part of</span>
                  {partners.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      {p.logo
                        ? <img src={p.logo} alt={p.name} className="h-10 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
                        : <span className="text-xs font-bold text-foreground">{p.name}</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Bottom Section: Contact links */}
          {contacts.length > 0 && (
            <motion.footer className="mt-8 w-full" variants={itemVariants}>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {contacts.map((c) => (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.external ? '_blank' : undefined}
                    rel={c.external ? 'noopener noreferrer' : undefined}
                    className="flex items-center gap-1.5 hover:text-primary transition-colors"
                  >
                    <InfoIcon type={c.icon} />
                    {c.label}
                  </a>
                ))}
              </div>
            </motion.footer>
          )}
        </div>

        {/* Right Side: Image with Clip Path Animation */}
        <motion.div
          className="w-full min-h-[300px] bg-cover bg-center md:w-1/2 md:min-h-full lg:w-2/5"
          style={{ backgroundImage: `url(${backgroundImage})` }}
          initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
          animate={{ clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)' }}
          transition={{ duration: 1.2, ease: 'circOut' }}
        />
      </motion.section>
    );
  }
);

HeroSection.displayName = 'HeroSection';

export { HeroSection };
