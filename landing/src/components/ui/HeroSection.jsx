import React from 'react';
import { motion } from 'framer-motion';

/* ── icon maps ─────────────────────────────────────────────────────────── */
const ContactIcon = ({ icon }) => {
  const icons = {
    website: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
        <circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    github: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
    email: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
        <rect width="20" height="16" x="2" y="4"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
    address: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    ),
  };
  return <span className="mr-2 flex-shrink-0 opacity-60">{icons[icon] ?? null}</span>;
};

/* ── component ──────────────────────────────────────────────────────────── */
const HeroSection = React.forwardRef(
  ({ className, logo, slogan, title, subtitle, downloads = [], contacts = [], backgroundImage, ...props }, ref) => {

    const containerVariants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } },
    };

    const itemVariants = {
      hidden: { y: 20, opacity: 0 },
      visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } },
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
        {/* ── Left: content ── */}
        <div className="flex w-full flex-col justify-between p-8 md:w-1/2 md:p-12 lg:w-3/5 lg:p-16">
          <div>
            {/* Logo */}
            <motion.header className="mb-12" variants={itemVariants}>
              {logo && (
                <div className="flex items-center gap-3">
                  {logo.url && (
                    <img src={logo.url} alt={logo.alt} className="h-10 w-auto logo-on-light" />
                  )}
                  <div>
                    {logo.text && (
                      <p className="text-lg font-black tracking-tighter uppercase">{logo.text}</p>
                    )}
                    {slogan && (
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
                        {slogan}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.header>

            {/* Headline + subtitle */}
            <motion.div variants={containerVariants}>
              <motion.h1
                className="text-4xl font-black leading-[1.05] tracking-tighter text-foreground md:text-[3.25rem]"
                variants={itemVariants}
              >
                {title}
              </motion.h1>
              <motion.div className="my-6 h-[3px] w-16 bg-black" variants={itemVariants} />
              <motion.p
                className="mb-10 max-w-md text-[0.9375rem] leading-relaxed text-neutral-500"
                variants={itemVariants}
              >
                {subtitle}
              </motion.p>

              {/* ── Download buttons ── */}
              {downloads.length > 0 && (
                <motion.div
                  className="flex flex-col sm:flex-row gap-1 mb-10 max-w-lg"
                  variants={itemVariants}
                >
                  {downloads.map((dl, i) => (
                    <a
                      key={i}
                      href={dl.href}
                      className={`flex-1 flex flex-col items-center justify-center py-5 px-6 transition-all
                        ${i === 0
                          ? 'bg-black text-white hover:bg-neutral-800'
                          : 'border border-black text-black hover:bg-black hover:text-white'
                        }`}
                    >
                      <span className="material-symbols-outlined text-2xl mb-1">{dl.icon}</span>
                      <span className="font-black uppercase text-[11px] tracking-widest">{dl.label}</span>
                      {dl.sub && (
                        <span className="mt-0.5 text-[9px] uppercase tracking-widest opacity-60">
                          {dl.sub}
                        </span>
                      )}
                    </a>
                  ))}
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* ── Contact links row ── */}
          {contacts.length > 0 && (
            <motion.footer className="mt-8 w-full" variants={itemVariants}>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {contacts.map((c, i) => (
                  <a
                    key={i}
                    href={c.href}
                    target={c.external ? '_blank' : undefined}
                    rel={c.external ? 'noopener noreferrer' : undefined}
                    className="flex items-center text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black transition-colors border-b border-neutral-200 hover:border-black pb-0.5"
                  >
                    <ContactIcon icon={c.icon} />
                    {c.label}
                  </a>
                ))}
              </div>
            </motion.footer>
          )}
        </div>

        {/* ── Right: image ── */}
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
