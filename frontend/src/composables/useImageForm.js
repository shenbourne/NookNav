// Keep editable display paths separate from canonical source URLs.
export function imageSourceUrl(url, origin) {
  return origin && url === origin.url ? origin.source : url
}

export function createImageFields(link = {}) {
  const favicon = link.favicon || ''
  const faviconDark = link.faviconDark || ''
  return {
    iconScale: Math.min(200, Math.max(50, Number(link.iconScale) || 100)),
    favicon,
    faviconDark,
    imageOrigins: {
      favicon: { url: favicon, source: link.imageSources?.favicon ?? favicon },
      faviconDark: { url: faviconDark, source: link.imageSources?.faviconDark ?? faviconDark },
    },
    imageGallery: (link.imageGallery || []).map((url, index) => ({
      id: 'img_' + index,
      url,
      origin: { url, source: link.imageSources?.imageGallery?.[index] ?? url },
    })),
  }
}
