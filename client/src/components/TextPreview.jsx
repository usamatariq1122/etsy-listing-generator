const TEXT_FILES = [
  { key: 'file1_text', name: 'product-content.pdf', title: 'File 1 — Product / pattern guide', field: 'file1Text' },
  { key: 'file2_text', name: 'listing-seo-package.pdf', title: 'File 2 — SEO title, tags, description, checklist, video idea', field: 'file2Text' },
];

const PROMPT_GROUPS = [
  { field: 'mockupPrompts', title: 'Mockup prompts (4:3)', names: ['Primary Cover Thumbnail', 'Close-up Detail', 'Materials/Included Setup', 'Lifestyle/Scale Photo'] },
  { field: 'infographicPrompts', title: 'Infographic prompts', names: ['Digital Download Only', 'Size & Skill Level', 'Commercial License Included'] },
];

export default function TextPreview({ product }) {
  const notes = product.warnings?.cleaningNotes || [];
  const keywords = product.warnings?.keywords || {};
  const terms = keywords.terms || [];

  return (
    <div className="stack">
      {notes.length > 0 && (
        <p className="inline-note">
          Auto-cleaned File 1: {notes.join(', ')}.
        </p>
      )}

      {terms.length > 0 && (
        <details className="keywords">
          <summary>
            Keywords used for the title and tags
            <span className="muted small">
              {keywords.source === 'picked'
                ? 'the ones you ticked'
                : keywords.source === 'autocomplete'
                  ? 'live search data'
                  : 'from model judgement'}
            </span>
          </summary>
          <ul className="chips">
            {terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </details>
      )}

      {TEXT_FILES.map((file) => {
        const text = product[file.field] || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        return (
          <details key={file.key} className="drop">
            <summary>
              <span>{file.title}</span>
              <em className="drop-meta">{words ? `${words} words` : 'nothing yet'}</em>
              <a
                className="download"
                href={`/api/products/${product.id}/text/${file.key}`}
                download={file.name}
                onClick={(event) => event.stopPropagation()}
              >
                Download
              </a>
            </summary>
            <pre className="textdump">{text || '(empty)'}</pre>
          </details>
        );
      })}

      {PROMPT_GROUPS.map((group) => {
        const prompts = product[group.field] || [];
        if (!prompts.length) return null;
        return (
          <details key={group.field}>
            <summary>{group.title}</summary>
            <ol className="prompts">
              {prompts.map((prompt, i) => (
                <li key={i}>
                  <strong>{group.names[i] || `Prompt ${i + 1}`}</strong>
                  <span>{prompt}</span>
                </li>
              ))}
            </ol>
          </details>
        );
      })}
    </div>
  );
}
