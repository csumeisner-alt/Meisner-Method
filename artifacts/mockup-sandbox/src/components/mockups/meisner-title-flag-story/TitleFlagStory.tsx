import './_group.css';

const FLAGS = [
  { id: 'default', name: 'Default U.S.', image: null, unlock: 'DEFAULT' },
  { id: 'heritage', name: 'Gadsden', image: '/__mockup/images/premium-flags/gadsden.png', unlock: '15 ACHIEVEMENTS' },
  { id: 'liberty', name: 'Liberty & Eagle', image: '/__mockup/images/premium-flags/liberty-eagle.jpg', unlock: '15 ACHIEVEMENTS' },
  { id: 'founders', name: 'Betsy Ross', image: '/__mockup/images/premium-flags/betsy-ross.jpg', unlock: '15 ACHIEVEMENTS' },
  { id: 'midnight', name: 'Red Union', image: '/__mockup/images/premium-flags/red-union.jpg', unlock: '15 ACHIEVEMENTS' },
  { id: 'southern-cross', name: 'Southern Cross', image: '/__mockup/images/premium-flags/southern-cross.jpg', unlock: '15 ACHIEVEMENTS' },
  { id: 'eagle', name: 'Pride', image: '/__mockup/images/premium-flags/pride.jpg', unlock: '30 QUOTE VIEWS' },
] as const;

function FlagPreview({ flag }: { flag: (typeof FLAGS)[number] }) {
  return (
    <div
      className="title-story-flag-frame"
      role="img"
      aria-label={`${flag.name} selected beside Meisner Method`}
    >
      {flag.image
        ? <img src={flag.image} alt="" />
        : <span className="title-story-default-flag">🇺🇸</span>}
      <span className="title-story-selected-check" aria-hidden="true">✓</span>
    </div>
  );
}

export function TitleFlagStory() {
  return (
    <main className="title-flag-story" aria-label="Meisner Method title flag story card">
      <header className="title-story-top">
        <div className="title-story-brand">
          <img src="/__mockup/images/meisner-method-icon-128.png" alt="" />
          <div className="title-story-brand-copy">
            <span className="title-story-brand-name">MEISNER METHOD</span>
            <span className="title-story-brand-tagline">AI-powered market intelligence</span>
          </div>
        </div>
        <span className="title-story-kicker">TITLE FLAGS</span>
      </header>

      <section className="title-story-heading">
        <p className="title-story-eyebrow">YOUR NAME, YOUR SIGNATURE</p>
        <h1>Same title.<br /><span>Seven flag choices.</span></h1>
        <p className="title-story-deck">Each selected badge, shown beside the Meisner Method title.</p>
      </section>

      <section className="title-story-list" aria-label="All seven selected title flags">
        {FLAGS.map((flag, index) => (
          <article className="title-story-row" key={flag.id}>
            <span className="title-story-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="title-story-lockup">
              <img src="/__mockup/images/meisner-method-icon-128.png" alt="" />
              <div className="title-story-lockup-copy">
                <span className="title-story-lockup-name">Meisner Method</span>
                <span className="title-story-lockup-tagline">AI-powered market intelligence</span>
              </div>
            </div>
            <div className="title-story-flag-column">
              <FlagPreview flag={flag} />
              <span className="title-story-flag-name">{flag.name}</span>
            </div>
          </article>
        ))}
      </section>

      <footer className="title-story-footer">
        <div className="title-story-footer-rule" />
        <p>
          <strong>Unlocks:</strong> Default + five designs after all 15 achievements.
          {' '}Pride unlocks after 30 Biden quote views.
        </p>
      </footer>
    </main>
  );
}
