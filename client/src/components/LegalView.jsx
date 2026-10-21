import { LEGAL_DOCS } from '../legal.js';

/** One legal page, rendered in place of the login card. `doc` is a key of
 *  LEGAL_DOCS; anything unknown falls back to the terms so the page never
 *  renders empty. */
export default function LegalView({ doc, onBack, contactEmail }) {
  const page = LEGAL_DOCS[doc] || LEGAL_DOCS.terms;

  return (
    <section className="card legal">
      <div className="row-between">
        <h2>{page.title}</h2>
        <button className="small" onClick={onBack}>
          Back
        </button>
      </div>
      <p className="muted small">{page.updated}</p>
      <p>{page.intro}</p>
      {page.sections.map((section) => (
        <div className="legal-section" key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      ))}

      <div className="legal-section">
        <h3>Trademark</h3>
        <p>
          The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not
          endorsed or certified by Etsy, Inc.
        </p>
      </div>

      {contactEmail && (
        <div className="legal-section">
          <h3>Contact</h3>
          <p>
            Questions about this service, or a request about your data: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        </div>
      )}
    </section>
  );
}
