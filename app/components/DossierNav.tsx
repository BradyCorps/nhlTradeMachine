export function DossierNav({ sections }: { sections: { id: string; label: string }[] }) {
  return <nav aria-label="Dossier sections" className="dossier-section-nav">
    {sections.map(section => <a key={section.id} href={`#${section.id}`} className="tap-target filter-btn">{section.label}</a>)}
  </nav>;
}
