import Footer from '../components/Footer'

const encouraged = [
  'Respecting the purpose of our community, our activities, and our ways of gathering.',
  'Engaging kindly and honestly with others.',
  'Respecting different viewpoints and experiences.',
  'Taking responsibility for our actions and contributions.',
  'Gracefully giving and accepting constructive feedback.',
  'Committing to repairing harm when it occurs.',
  'Behaving in other ways that promote and sustain the well-being of our community.',
]

const restricted = [
  {
    title: 'Harassment',
    desc: 'Violating explicitly expressed boundaries or engaging in unnecessary personal attention after any clear request to stop.',
  },
  {
    title: 'Character attacks',
    desc: 'Making insulting, demeaning, or pejorative comments directed at a community member or group of people.',
  },
  {
    title: 'Stereotyping or discrimination',
    desc: 'Characterizing anyone\'s personality or behavior on the basis of immutable identities or traits.',
  },
  {
    title: 'Sexualization',
    desc: 'Behaving in a way that would generally be considered inappropriately intimate in the context or purpose of the community.',
  },
  {
    title: 'Violating confidentiality',
    desc: 'Sharing or acting on someone\'s personal or private information without their permission.',
  },
  {
    title: 'Endangerment',
    desc: 'Causing, encouraging, or threatening violence or other harm toward any person or group.',
  },
]

const enforcementLadder = [
  {
    level: '01',
    name: 'Warning',
    event: 'A violation involving a single incident or series of incidents.',
    consequence: 'A private, written warning from the Community Moderators.',
    repair: 'A private written apology, acknowledgement of responsibility, and seeking clarification on expectations.',
  },
  {
    level: '02',
    name: 'Temporarily Limited Activities',
    event: 'A repeated incidence of a violation that previously resulted in a warning, or the first incidence of a more serious violation.',
    consequence: 'A private, written warning with a time-limited cooldown period.',
    repair: 'Making an apology, using the cooldown period to reflect on actions and impact.',
  },
  {
    level: '03',
    name: 'Temporary Suspension',
    event: 'A pattern of repeated violation or a single serious violation.',
    consequence: 'A private written warning with conditions for return from suspension.',
    repair: 'Respecting the spirit of the suspension, meeting the specified conditions for return.',
  },
  {
    level: '04',
    name: 'Permanent Ban',
    event: 'A pattern of repeated violations that other steps have failed to resolve, or a violation so serious it cannot be remedied.',
    consequence: 'Access to all community spaces, tools, and communication channels is removed permanently.',
    repair: 'No possible repair in cases of this severity.',
  },
]

export default function CodeOfConduct() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">

        {/* Header */}
        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-4xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Community
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              CODE OF CONDUCT
            </h1>
            <p className="text-on-surface-variant text-[0.875rem] uppercase tracking-widest font-bold">
              Contributor Covenant 3.0 — TEMPO Project
            </p>
          </div>
        </section>

        <section className="px-8 py-24 bg-surface">
          <div className="max-w-4xl mx-auto space-y-20">

            {/* Our Pledge */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
                Our Pledge
              </p>
              <p className="text-[1rem] leading-[1.8] text-on-surface-variant">
                We pledge to make our community welcoming, safe, and equitable for all. We are
                committed to fostering an environment that respects and promotes the dignity,
                rights, and contributions of all individuals, regardless of characteristics
                including race, ethnicity, caste, color, age, physical characteristics,
                neurodiversity, disability, sex or gender, gender identity or expression, sexual
                orientation, language, philosophy or religion, national or social origin,
                socio-economic position, level of education, or other status.
              </p>
            </div>

            {/* Encouraged Behaviors */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-8">
                Encouraged Behaviors
              </p>
              <ul className="space-y-4">
                {encouraged.map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-[1rem] mt-0.5 flex-shrink-0">
                      check_circle
                    </span>
                    <span className="text-[0.875rem] leading-[1.7] text-on-surface-variant">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Restricted Behaviors */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-8">
                Restricted Behaviors
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-200 border border-neutral-200">
                {restricted.map((item, i) => (
                  <div key={i} className="bg-white p-8">
                    <h4 className="font-black text-[0.75rem] uppercase tracking-widest mb-3">
                      {item.title}
                    </h4>
                    <p className="text-[0.8125rem] text-neutral-500 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Restrictions */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Other Restrictions
              </p>
              <div className="bg-surface-container-lowest border-l-4 border-black p-8 space-y-4">
                {[
                  ['Misleading identity', 'Impersonating someone else for any reason, or pretending to be someone else to evade enforcement actions.'],
                  ['Failing to credit sources', 'Not properly crediting the sources of content you contribute.'],
                  ['Promotional materials', 'Sharing marketing or other commercial content outside the norms of the community.'],
                  ['Irresponsible communication', 'Failing to responsibly present content which includes, links, or describes any restricted behaviors.'],
                ].map(([title, desc]) => (
                  <div key={title}>
                    <span className="font-bold text-[0.6875rem] uppercase tracking-widest">{title} — </span>
                    <span className="text-[0.8125rem] text-on-surface-variant leading-relaxed">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reporting */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
                Reporting an Issue
              </p>
              <div className="bg-black text-[#E2E2E2] p-10">
                <p className="text-[0.875rem] leading-[1.8]">
                  Instances of abusive, harassing, or otherwise unacceptable behaviour should be
                  reported to the project maintainers. All reports will be reviewed and
                  investigated promptly and confidentially. The project team will make a
                  good-faith effort to maintain the confidentiality and privacy of the person
                  reporting the incident.
                </p>
              </div>
            </div>

            {/* Enforcement Ladder */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-8">
                Enforcement Ladder
              </p>
              <div className="space-y-4">
                {enforcementLadder.map((rung) => (
                  <div key={rung.level} className="flex gap-8 group">
                    <div className="text-[2rem] font-black text-outline-variant group-hover:text-primary transition-colors flex-shrink-0 leading-none pt-1">
                      {rung.level}
                    </div>
                    <div className="border-b border-outline-variant/20 pb-8 flex-1">
                      <h4 className="font-black text-[0.875rem] uppercase tracking-widest mb-4">
                        {rung.name}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-[0.8125rem]">
                        <div>
                          <p className="font-bold text-[0.625rem] uppercase tracking-widest text-outline mb-2">
                            Event
                          </p>
                          <p className="text-on-surface-variant leading-relaxed">{rung.event}</p>
                        </div>
                        <div>
                          <p className="font-bold text-[0.625rem] uppercase tracking-widest text-outline mb-2">
                            Consequence
                          </p>
                          <p className="text-on-surface-variant leading-relaxed">{rung.consequence}</p>
                        </div>
                        <div>
                          <p className="font-bold text-[0.625rem] uppercase tracking-widest text-outline mb-2">
                            Repair
                          </p>
                          <p className="text-on-surface-variant leading-relaxed">{rung.repair}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
                Scope
              </p>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                This Code of Conduct applies within all community spaces, and also applies when
                an individual is officially representing the community in public spaces. Examples
                include using an official email address, posting via an official social media
                account, or acting as an appointed representative at an online or offline event.
              </p>
            </div>

            {/* Attribution */}
            <div className="pt-8 border-t border-outline-variant/20">
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
                Attribution
              </p>
              <p className="text-[0.8125rem] leading-[1.8] text-on-surface-variant mb-4">
                This Code of Conduct is adapted from the{' '}
                <a
                  href="https://www.contributor-covenant.org/version/3/0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  Contributor Covenant, version 3.0
                </a>
                . Stewarded by the Organization for Ethical Source and licensed under{' '}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  CC BY-SA 4.0
                </a>
                .
              </p>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
