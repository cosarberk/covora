/**
 * @module @covora/client/capture
 *
 * Tarayıcıda ekran görüntüsü yakalama. `html2canvas` DOM'u (viewport dışı,
 * scroll'la ulaşılan içerik dahil) çizer; sonuç base64 PNG olarak döner.
 */

import html2canvas from 'html2canvas'

/**
 * Verilen elemanın (varsayılan `document.body`) ekran görüntüsünü yakalar.
 *
 * @param element - Yakalanacak kök eleman.
 * @returns Base64 kodlu PNG (data: öneki olmadan).
 */
export const captureScreenshot = async (element: HTMLElement = document.body): Promise<string> => {
  const canvas = await html2canvas(element)
  return stripDataUrlPrefix(canvas.toDataURL('image/png'))
}

/**
 * `data:image/png;base64,` önekini kaldırıp yalnızca base64 gövdesini döner
 * (Ollama/`ReviewInput` bu biçimi bekler).
 *
 * @param dataUrl - Tam data URL.
 * @returns Base64 gövdesi.
 */
const stripDataUrlPrefix = (dataUrl: string): string => {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}
