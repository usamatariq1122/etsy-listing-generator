// The two PDF deliverables each listing produces.
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
    name: 'etsy-listing-seo.pdf',
    title: 'Listing SEO Package',
    docTitle: () => 'Etsy Listing & SEO Package',
    subtitle: (product) => product.product_name,
  },
];
