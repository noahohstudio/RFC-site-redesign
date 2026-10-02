// Navigation content — mirrors the Figma “Nav Menu” component (Browse / Learn / Contribute / About).
// External links point at real pages on rfc-editor.org and ietf.org (checked 24 Sep 2026).

export const MENUS = [
  {
    key: 'browse',
    label: 'Browse',
    intro: {
      overline: 'Browse',
      title: 'What are you looking for today?',
      body: 'Start with everything, or narrow it down by time or by kind of document.',
    },
    cols: [
      [
        { label: 'Start here', items: [
          { icon: 'list', title: 'All RFCs', desc: 'Every RFC, newest first', href: '#/' },
        ] },
        { label: 'By time', items: [
          { icon: 'layers', title: 'By era', desc: 'Six eras, from ARPANET to today', action: 'jump-eras' },
          { icon: 'calendar', title: 'By year', desc: 'Jump to any year since 1969', action: 'jump-years' },
        ] },
      ],
      [
        { label: 'By kind', items: [
          { icon: 'check', title: 'Standards (STD)', desc: 'The mature core of the internet', href: '#/kind/I' },
          { icon: 'bookmark', title: 'Best Current Practices', desc: 'How to run and operate things', href: '#/kind/B' },
          { icon: 'filter', title: 'By stream', desc: 'IETF, IRTF, IAB, Independent, Editorial', action: 'jump-streams' },
        ] },
        { label: 'Around the documents', items: [
          { icon: 'flag', title: 'Errata', desc: 'Corrections, listed beside each RFC', href: '#/errata' },
          { icon: 'rss', title: 'Download & feeds', desc: 'Bulk downloads, RSS and mirrors', href: 'https://www.rfc-editor.org/series/rfc-download/', ext: true },
        ] },
      ],
    ],
    aside: { type: 'eras', label: 'Jump to an era', note: 'The count beside each era is how many RFCs it published.' },
  },
  {
    key: 'learn',
    label: 'Learn',
    intro: {
      overline: 'Learn',
      title: 'New here? Let’s start at the beginning.',
      body: 'Short, friendly guides first — then the documents themselves.',
    },
    cols: [
      [
        { label: 'The basics', items: [
          { icon: 'book', title: 'What is an RFC?', desc: 'Where RFCs come from and who writes them', href: 'https://www.rfc-editor.org/series/rfc/', ext: true },
          { icon: 'document', title: 'Reading an RFC', desc: 'Headers, sections and words like MUST', href: '#/rfc/2119' },
          { icon: 'info', title: 'Status, explained', desc: 'What the shapes mean, from ◐ to ●', action: 'legend' },
        ] },
      ],
      [
        { label: 'Go deeper', items: [
          { icon: 'history', title: 'Internet history', desc: 'Walk the series through six eras', href: '#/era/arpanet' },
          { icon: 'hash', title: 'Glossary', desc: 'ABNF, BCP, STD, obsoleted and more', action: 'glossary' },
          { icon: 'help', title: 'FAQ', desc: 'Quick answers to common questions', href: 'https://www.rfc-editor.org/series/rfc-faq/', ext: true },
          { icon: 'copy', title: 'Using RFCs', desc: 'Citing, implementing and reusing', href: 'https://www.rfc-editor.org/series/rfc-use/', ext: true },
        ] },
      ],
    ],
    aside: {
      type: 'feature', era: 'arpanet', label: 'Where it all began', title: 'RFC 1 · Host Software',
      body: 'Written in April 1969 by Steve Crocker, as a humble request for comments. Read it exactly as it was typed.',
      link: { text: 'Read RFC 1 →', href: '#/rfc/1' },
    },
  },
  {
    key: 'contribute',
    label: 'Contribute',
    intro: {
      overline: 'Contribute',
      title: 'Want to help write the internet?',
      body: 'How ideas become RFCs, and where you can lend a hand.',
    },
    cols: [
      [
        { label: 'How it works', items: [
          { icon: 'pen', title: 'How RFCs are created', desc: 'From Internet-Draft to published RFC', href: 'https://authors.ietf.org/', ext: true },
          { icon: 'lineage', title: 'Publication process', desc: 'Every step the Production Center takes', href: 'https://authors.ietf.org/rfc-publication-process', ext: true },
          { icon: 'inbox', title: 'Document queue', desc: 'Approved documents on their way', href: 'https://queue.rfc-editor.org/', ext: true },
        ] },
      ],
      [
        { label: 'Get involved', items: [
          { icon: 'book', title: 'Style guide', desc: 'The conventions every RFC follows', href: '#/rfc/7322' },
          { icon: 'user', title: 'Independent submissions', desc: 'Publishing outside the IETF', href: 'https://www.rfc-editor.org/authors/rfc-independent-submissions/', ext: true },
          { icon: 'flag', title: 'Report an erratum', desc: 'Found a mistake? Tell the authors', href: 'https://errata.rfc-editor.org/', ext: true },
        ] },
      ],
    ],
    aside: {
      type: 'note', label: 'Work in progress',
      body: 'Drafts and working-group discussion live on the IETF Datatracker — this archive holds what has been published.',
      link: { text: 'datatracker.ietf.org ↗', href: 'https://datatracker.ietf.org/', ext: true },
    },
  },
  {
    key: 'about',
    label: 'About',
    intro: {
      overline: 'About',
      title: 'Who looks after the archive?',
      body: 'The people, process and promises behind the RFC Series.',
    },
    cols: [
      [
        { label: 'The archive', items: [
          { icon: 'info', title: 'About the RFC Editor', desc: 'Publishing and archiving since 1969', href: 'https://www.rfc-editor.org/about/rfc-editor/', ext: true },
          { icon: 'layers', title: 'The RFC Series', desc: 'How the series is governed (RFC 9920)', href: '#/rfc/9920' },
          { icon: 'document', title: 'Reports', desc: 'Operational and annual reports', href: 'https://www.rfc-editor.org/about/rpc-reports/', ext: true },
        ] },
      ],
      [
        { label: 'Reach us', items: [
          { icon: 'mail', title: 'Contact', desc: 'Questions, corrections and press', href: 'https://www.rfc-editor.org/about/contact/', ext: true },
          { icon: 'lock', title: 'Privacy', desc: 'How this site handles your data', href: 'https://www.ietf.org/privacy-statement/', ext: true },
          { icon: 'rss', title: 'Stay current', desc: 'RSS and the rfc-dist mailing list', href: 'https://www.rfc-editor.org/rfcrss.xml', ext: true },
        ] },
      ],
    ],
    aside: {
      type: 'note', label: 'Our promise',
      body: 'Every RFC stays exactly as it was published. Corrections are listed beside a document — never written into it.',
    },
  },
];
