// The two PDF deliverables each listing produces. A marketplace name never
// appears in one of these - they are the files a buyer can end up holding.
export const TEXT_FILES = [
  {
    key: 'file1_text',
    name: 'product-content.pdf',
    title: 'Product Guide',
    docTitle: (product) => product.product_name,
    subtitle: () => 'Product guide',
    cover: true,
  },
  {
    key: 'file2_text',
    name: 'listing-seo-package.pdf',
    title: 'Listing SEO Package',
    docTitle: () => 'Listing & SEO Package',
    subtitle: (product) => product.product_name,
  },
];
