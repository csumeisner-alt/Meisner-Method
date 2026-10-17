import './_group.css';

const confettiColors = ['#D7B66D', '#9AE9D1', '#63DCE6'];

const confetti = Array.from({ length: 22 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  color: confettiColors[index % confettiColors.length],
  size: `${6 + ((index * 5) % 6)}px`,
  delay: `${(index * 47) % 500}ms`,
  duration: `${1400 + ((index * 23) % 500)}ms`,
  drift: `${((index * 19) % 100) - 50}px`,
  spin: `${720 + ((index * 83) % 720)}deg`,
}));

export function Current() {
  return (
    <main className="neon-gucci-preview">
      <video
        className="neon-gucci-preview__video"
        src="/__mockup/media/neon-gucci-unlock.mp4"
        poster="/__mockup/media/neon-gucci-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Neon Gucci unlock reveal video"
      />
      <div className="neon-gucci-preview__scrim" />
      <div className="neon-gucci-preview__confetti" aria-hidden="true">
        {confetti.map((piece, index) => (
          <span
            className="neon-gucci-preview__piece"
            key={index}
            style={{
              left: piece.left,
              backgroundColor: piece.color,
              '--piece-size': piece.size,
              '--piece-delay': piece.delay,
              '--piece-duration': piece.duration,
              '--piece-drift': piece.drift,
              '--piece-spin': piece.spin,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <button className="neon-gucci-preview__close" aria-label="Close celebration preview">
        ×
      </button>
      <section className="neon-gucci-preview__content">
        <p className="neon-gucci-preview__eyebrow">A REWARD, WELL EARNED</p>
        <div className="neon-gucci-preview__mark">GG</div>
        <h1 className="neon-gucci-preview__title">HYBRID NEON GUCCI</h1>
        <p className="neon-gucci-preview__subtitle">Your new look is unlocked.</p>
        <button className="neon-gucci-preview__activate">
          ACTIVATE NEON GUCCI <span className="neon-gucci-preview__arrow">↗</span>
        </button>
        <p className="neon-gucci-preview__hint">THE REVEAL CLOSES WHEN THE VIDEO ENDS</p>
      </section>
    </main>
  );
}
