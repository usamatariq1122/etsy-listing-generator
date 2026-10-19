const TEXT_FILES = [
  { key: 'file1_text', name: 'product-content.pdf', title: 'File 1 — Product / pattern guide', field: 'file1Text' },
  { key: 'file2_text', name: 'etsy-listing-seo.pdf', title: 'File 2 — SEO title, tags, description, checklist, video idea', field: 'file2Text' },
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

      {TEXT_FILES.map((file) => (
        <details key={file.key} open={file.key === 'file1_text'}>
          <summary>
            <span>{file.title}</span>
            <a
              className="download"
              href={`/api/products/${product.id}/text/${file.key}`}
              download={file.name}
            >
              Download {file.name}
            </a>
          </summary>
          <pre className="textdump">{product[file.field] || '(empty)'}</pre>
        </details>
      ))}

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
