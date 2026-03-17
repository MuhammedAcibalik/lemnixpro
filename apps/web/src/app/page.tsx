const platformAreas = [
  "Gateway and identity boundaries",
  "Master data and weekly planning services",
  "Optimization orchestration and result services",
  "Python optimization engine integration surface"
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Backend-first foundation</p>
        <h1>LemnixPRO Platform</h1>
        <p className="description">
          The web application is intentionally thin in this pass. Core work is
          focused on service boundaries, persistence ownership, messaging
          contracts, and optimization engine integration points.
        </p>
        <ul className="capability-list">
          {platformAreas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
