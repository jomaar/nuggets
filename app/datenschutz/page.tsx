export default function DatenschutzPage() {
  return (
    <main className="pt-10 pb-24 max-w-lg">
      <h1 className="text-3xl mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
        Datenschutz&shy;erklärung
      </h1>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Verantwortlicher
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Jörg Arnold, Hegnauhof 21, 73660 Urbach<br />
          <a href="mailto:webmaster@jomaar.de" style={{ color: 'var(--accent-light)' }}>
            webmaster@jomaar.de
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Hosting
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Diese Website wird gehostet von <strong>netcup GmbH</strong>, Daimlerstraße 25,
          76185 Karlsruhe. Beim Aufruf der Website werden durch den Hoster automatisch
          Server-Logdaten erfasst (IP-Adresse, Zeitstempel, aufgerufene Seite). Diese
          Daten sind für den Betrieb technisch notwendig und werden nicht an Dritte
          weitergegeben.{' '}
          <a
            href="https://www.netcup.de/kontakt/datenschutzerklaerung.php"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-light)' }}
          >
            Datenschutzerklärung netcup →
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Cookies
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Diese Website setzt <strong>keine Tracking- oder Analyse-Cookies</strong>.
          Ein technisch notwendiges Session-Cookie wird ausschließlich gesetzt, wenn
          sich der Betreiber aktiv anmeldet. Besucher erhalten keinerlei Cookies.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Analyse & Tracking
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Es werden keine Analyse- oder Tracking-Dienste (z. B. Google Analytics)
          eingesetzt. Es findet kein Tracking über Seitengrenzen hinweg statt.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Externe Ressourcen
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Schriftarten werden lokal ausgeliefert. Es findet keine Einbindung externer
          Dienste (z. B. Google Fonts CDN) statt, die Ihre IP-Adresse übermitteln würden.
        </p>
      </section>

      <section>
        <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
          Ihre Rechte
        </h2>
        <p className="text-sm" style={{ lineHeight: '1.7' }}>
          Sie haben das Recht auf Auskunft, Berichtigung und Löschung Ihrer
          gespeicherten Daten (Art. 15–17 DSGVO). Da diese Website keine
          Nutzerkonten oder Formulare für Besucher anbietet, werden außer
          den technischen Server-Logs keine personenbezogenen Daten erhoben.
          Bei Fragen wenden Sie sich an{' '}
          <a href="mailto:webmaster@jomaar.de" style={{ color: 'var(--accent-light)' }}>
            webmaster@jomaar.de
          </a>.
        </p>
      </section>
    </main>
  )
}
