/**
 * @module @covora/client/capture
 *
 * Tarayıcıda ekran görüntüsü yakalama. `html2canvas` DOM'u (viewport dışı,
 * scroll'la ulaşılan içerik dahil) çizer; sonuç base64 PNG olarak döner.
 */

/**
 * Verilen elemanın (varsayılan `document.body`) ekran görüntüsünü yakalar.
 * `html2canvas` CJS bir paket olduğundan NodeNext altında dinamik import ile
 * yüklenir (aynı zamanda lazy-load faydası sağlar).
 *
 * @param element - Yakalanacak kök eleman.
 * @returns Base64 kodlu PNG (data: öneki olmadan).
 */
/** html2canvas'ın CJS default export'unun çağrılabilir imzası. */
type Html2Canvas = (element: HTMLElement) => Promise<HTMLCanvasElement>

export const captureScreenshot = async (element: HTMLElement = document.body): Promise<string> => {
  const html2canvas = (await import('html2canvas')).default as unknown as Html2Canvas
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
