export default function ImpressumPage() {
  return (
    <main className="pt-3 pb-24 max-w-lg">
      <h1 className="text-3xl mb-8">
        Impressum
      </h1>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Angaben gemäß § 5 TMG
        </h2>
        <p style={{ lineHeight: '1.8' }}>
          Jörg Arnold<br />
          Hegnauhof 21<br />
          73660 Urbach
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Kontakt
        </h2>
        <p>
          <a
            href="mailto:webmaster@jomaar.de"
            style={{ color: 'var(--accent-light)' }}
          >
            webmaster@jomaar.de
          </a>
        </p>
      </section>

      <section>
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Hinweis
        </h2>
        <p className="text-sm" style={{ color: 'var(--muted)', lineHeight: '1.7' }}>
          Diese Website ist ein privates, nicht-kommerzielles Projekt zur persönlichen
          Wissensverwaltung. Es werden keine Waren oder Dienstleistungen angeboten.
        </p>
      </section>
    </main>
  )
}
