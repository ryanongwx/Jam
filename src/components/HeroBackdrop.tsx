/**
 * Decorative music-themed motion behind the hero title (no data / backend).
 */
export function HeroBackdrop() {
  return (
    <div className="hero-backdrop" aria-hidden>
      <div className="hero-backdrop__base" />
      <div className="hero-backdrop__aurora" />
      <div className="hero-backdrop__glow hero-backdrop__glow--a" />
      <div className="hero-backdrop__glow hero-backdrop__glow--b" />
      <div className="hero-backdrop__staff">
        <span className="hero-backdrop__staff-line" />
        <span className="hero-backdrop__staff-line" />
        <span className="hero-backdrop__staff-line" />
        <span className="hero-backdrop__staff-line" />
        <span className="hero-backdrop__staff-line" />
      </div>
      <div className="hero-backdrop__vinyl">
        <span className="hero-backdrop__vinyl-groove" />
        <span className="hero-backdrop__vinyl-hole" />
      </div>
      <div className="hero-backdrop__eq">
        {["eq-a", "eq-b", "eq-c", "eq-d", "eq-e", "eq-f", "eq-g"].map((c) => (
          <span key={c} className={`hero-backdrop__eq-bar ${c}`} />
        ))}
      </div>
      <div className="hero-backdrop__notes">
        <span className="hero-backdrop__note hero-backdrop__note--1">♪</span>
        <span className="hero-backdrop__note hero-backdrop__note--2">♫</span>
        <span className="hero-backdrop__note hero-backdrop__note--3">♪</span>
        <span className="hero-backdrop__note hero-backdrop__note--4">♬</span>
      </div>
      <div className="hero-backdrop__ripple hero-backdrop__ripple--1" />
      <div className="hero-backdrop__ripple hero-backdrop__ripple--2" />
    </div>
  );
}
