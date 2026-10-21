// Legal page content, kept as plain data so the copy can be read and edited
// without touching any component. Every claim here matches what the portal
// actually does — nothing more is promised.

export const LEGAL_DOCS = {
  terms: {
    title: 'Terms of Service',
    updated: 'Current as of October 2026.',
    intro:
      'Listora turns a product name into a listing package: guide text, an SEO document, thirteen tags, ' +
      'seven image prompts and a ZIP you can download. These terms say what it does and, just as ' +
      'importantly, what it does not do.',
    sections: [
      {
        heading: 'What this service is',
        paragraphs: [
          'Listora is a writing and packaging tool. It stores your listings, your uploaded images and ' +
            'the files it builds for you, and it hands them back as downloads. It is not a marketplace: it ' +
            'never sells anything on its own, never shows anything to a buyer unless you ask it to publish ' +
            'a listing to your own shop, and never decides where you list.',
          'By using this portal you accept these terms. If they do not suit you, do not use it.',
        ],
      },
      {
        heading: 'Everything it writes is a draft',
        paragraphs: [
          'The product guide it generates is a draft, and the portal says so on screen: test the pattern ' +
            'yourself before selling anything made from it. Listora does not verify that a pattern works, ' +
            'that a finished item fits, or that anything will sell.',
          'The SEO score is a checklist of the marketplace’s own limits and a couple of common habits. It ' +
            'is not a ranking guarantee, and no part of this portal promises that your listing will rank, ' +
            'convert or be approved by any platform.',
          'What you list, what you charge and what you claim are yours to decide and yours to review ' +
            'before anything goes out.',
        ],
      },
      {
        heading: 'Your AI account, your limits',
        paragraphs: [
          'Every generation runs through an API key you saved in Settings, so the work happens on your ' +
            'own Gemini, Groq or OpenRouter account. Any daily limit, quota or bill the provider applies ' +
            'belongs to that account — not to this tool, which takes no cut and sets no cap of its own.',
          'You sign in with your own email-and-password account. Keep your password safe; if you lose it ' +
            'you can reset it by email. The listings, uploaded files and settings saved to an account are ' +
            'visible only to that account, and a fresh account sees none of anyone else’s.',
        ],
      },
      {
        heading: 'Connecting your Etsy shop',
        paragraphs: [
          'If the shop connection is switched on and you connect your own Etsy shop, Listora saves the ' +
            'package there as a draft first, and never sends anything live on its own. Only when you press ' +
            'Publish — and confirm — does it ask Etsy to make that draft live on your shop. You can still ' +
            'review, change or publish the listing in Etsy instead.',
          'Listora does not delete listings: it never asks for the delete permission, and only the ' +
            'listings-write permission is requested. Etsy itself must approve the app key before any of ' +
            'this works, and neither this portal nor its operator can speed that up. Disconnecting forgets ' +
            'the connection; nothing already on Etsy is touched.',
        ],
      },
      {
        heading: 'Files you upload',
        paragraphs: [
          'Images and PDFs you add are checked for format only — file type, size, the four-to-three shape ' +
            'and the minimum width. No check looks at who owns the rights to a file or whether an image ' +
            'shows what it claims. You keep the rights to what you upload, and you are responsible for ' +
            'what your listing says and shows.',
        ],
      },
      {
        heading: 'Availability and changes',
        paragraphs: [
          'The tool is provided as it is, without warranties of any kind. Models change, providers change, ' +
            'and features here may change with them; if the terms change, the page changes too, and ' +
            'keeping on using the portal means accepting them.',
          'These terms are governed by the law of the country where the person operating this portal is ' +
            'based. This page is a plain description of the service, not legal advice.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    updated: 'Current as of October 2026.',
    intro:
      'This portal keeps your listings so you can come back to them. This page says exactly what is ' +
      'stored, how the sensitive parts are protected, and where your text is sent when you click Generate.',
    sections: [
      {
        heading: 'What the portal stores',
        paragraphs: [
          'Your account (your email address and a hash of your password), the listing text it writes for ' +
            'you, the images you upload into the seven slots, the PDFs and ZIPs built from them, the brand ' +
            'name you set in Settings, and the provider API keys you save there. Everything lives in this ' +
            'portal’s own database and file storage on Netlify. Each product stays in History until you ' +
            'delete it.',
        ],
      },
      {
        heading: 'How your keys are protected',
        paragraphs: [
          'API keys are encrypted before they are written down, using AES-256-GCM, and the key that ' +
            'decrypts them is stored apart from the data it unlocks. The browser is only ever shown the ' +
            'last four characters of a saved key, and a stored key is never displayed again in full.',
        ],
      },
      {
        heading: 'Your account, email and password',
        paragraphs: [
          'You sign up with an email address and a password. The password is stored only as a salted ' +
            'scrypt hash; nobody, including the operator, can read it back. Signing in sets one session ' +
            'cookie, unreadable to page scripts, kept to your own requests, and expiring after thirty days. ' +
            'Five wrong attempts add a short wait before the next try is checked.',
          'Your email address is collected to create your account, to verify it, and to send a password ' +
            'reset link when you ask for one. A verification or reset link carries a single-use token that ' +
            'is stored only as a hash and expires shortly after it is sent. If email delivery is not ' +
            'switched on for a deployment, an account can still be created and signed into — the portal ' +
            'simply cannot send the link, and it never stores the email for any other purpose.',
        ],
      },
      {
        heading: 'Shop connection tokens',
        paragraphs: [
          'If you connect a shop, the Etsy connection tokens are kept in the same encrypted envelope as ' +
            'your API keys. They are never sent to the browser and never written to a log — the interface ' +
            'only ever sees your shop’s name. They are used to save a draft and, only if you press ' +
            'Publish, to make that draft live; disconnecting removes them.',
        ],
      },
      {
        heading: 'Where your text goes',
        paragraphs: [
          'Generating sends your product name and settings to the AI provider whose key you saved — your ' +
            'own Gemini, Groq or OpenRouter account — under that provider’s own privacy terms. If you use ' +
            'the keyword suggestions, the product name is also looked up against public search ' +
            'autocomplete. If you connect a shop, the draft details go to Etsy, and go there again only ' +
            'when you choose to publish. There is no other recipient: the portal itself keeps everything ' +
            'in its own database and storage.',
        ],
      },
      {
        heading: 'What is not collected',
        paragraphs: [
          'There is no advertising, no analytics and no third-party tracker in this app. Beyond the email ' +
            'and password of your account and the listing files you choose to store, nothing about you is ' +
            'collected on purpose, and no cookie is set except the sign-in one described above.',
        ],
      },
      {
        heading: 'Deleting your data',
        paragraphs: [
          'Deleting one listing or clearing History removes the stored rows and their files together. ' +
            'Removing a saved key or resetting the brand deletes those values. Disconnecting a shop ' +
            'forgets its tokens. None of these keep a hidden copy.',
        ],
      },
    ],
  },
};
